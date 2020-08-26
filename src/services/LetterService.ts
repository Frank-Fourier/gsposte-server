import { provide } from "inversify-binding-decorators";
import { MongoQuery, MongoRepository } from "@services/MongoRepository";
import { PDF_ROOT, PdfService } from "@services/PdfService";
import { LetterKind } from "@services/PostelService";
import { PriceService } from "@services/PriceService";
import { Letter, letterDecoder, LetterDocument, LetterModel } from "@models/LetterModel";
import { inject } from "inversify";
import { mapSenderToPerson, SenderDocument } from "@models/SenderModel";
import { mapRecipientToPerson } from "@models/RecipientModel";
import { createLogFile, detachLogFile, logger } from "@utils/winston";
import { PosteWayService } from "@services/PosteWayService";
import { sleep } from "@utils/sleep";
import { ConfirmResponse, SubmitResponse, TrackResponse } from "../posteway";
import { isTestEnv } from "@utils/system";
import { ProvisionService } from "@services/ProvisionService";
import winston from "winston";
import moment from "moment";
import fs from "fs";

@provide(LetterService)
export class LetterService extends MongoRepository<Letter, LetterDocument> {

    @inject(PdfService) private pdf: PdfService;
    @inject(PosteWayService) private posteway: PosteWayService;
    @inject(PriceService) private priceService: PriceService;
    @inject(ProvisionService) private provisionService: ProvisionService;

    constructor(private letterModel = LetterModel) {
        super(letterModel, letterDecoder, [
            "subject", "kind", "codePdf", "notes"
        ]);
    }

    public async save(letter: Letter, depopulate = true): Promise<LetterDocument> {
        let saved = await (await super.save(letter)).populate("sender recipients").execPopulate();
        const price = await this.priceService.calculatePrice(saved);
        await saved.updateOne({ $set: { price: price }}).exec();
        saved.price = price;

        if (!isTestEnv() && (!letter.sendAt || moment(letter.sendAt).isSameOrBefore(moment()))) {
            // No need to schedule, send everything immediately
            saved = await this.sendLetter(saved);
        }

        return depopulate ? saved.depopulate("sender recipients") : saved;
    }

    public async updateById(id: string, updateBody: (Partial<Letter> | any), upsert = false, runValidators = true): Promise<LetterDocument> {
        const updated = await (await super.updateById(id, updateBody, upsert, runValidators)).populate("sender recipients").execPopulate();
        if (updateBody.recipients || updateBody.kind) {
            const price = await this.priceService.calculatePrice(updated);
            await updated.updateOne({ $set: { price: price }}).exec();
            updated.price = price;
        }

        return updated;
    }

    public async updateOne(query: MongoQuery<Letter & LetterDocument>, updateBody: (Partial<Letter> | any), upsert = false, runValidators = true): Promise<LetterDocument> {
        const updated = await (await super.updateOne(query, updateBody, upsert, runValidators)).populate("sender recipients").execPopulate();
        if (updateBody.recipients || updateBody.kind) {
            const price = await this.priceService.calculatePrice(updated);
            await updated.updateOne({ $set: { price: price }}).exec();
            updated.price = price;
        }

        return updated;
    }

    /**
     * This function gets all the letters marked as **not sent** and uploads all of them to PosteWay if needed.
     * It's normally called by its CRON job, but no one stops you from calling it yourself.
     *
     * @returns Promise resolved with the number of errors when all the letters are sent.
     */
    public async batchSendScheduledLetters(): Promise<number> {
        const toSend = (await this.find({ sent: false }, { populate: "sender recipients" }))
            .filter(l => moment(l.sendAt).isSameOrBefore(moment()));

        if (toSend.length === 0) {
            logger.info(`Upload job has no scheduled letters to send! Waiting for the next CRON call...`);
            return 0;
        }

        logger.info(`Time to send scheduled letters! This time I'll send ${toSend.length} letters.`);
        let errors = 0;

        for (const letter of toSend) {
            const logFile = createLogFile(`${letter.codePdf}.log`);
            try {
                logger.info(`Sending scheduled letter '${letter.codePdf}'...`);
                await this.sendLetter(letter, logFile);
            } catch (err) {
                logger.error(`ARGH! Got an error while trying to send letter '${letter.codePdf}'!`, err);
                logFile.error(`ARGH! Got an error while sending this letter!`, err);
                errors++;
            } finally {
                detachLogFile(logFile);
            }
        }

        logger.info(`Done sending scheduled letters.`);
        return errors;
    }

    /**
     * This function gets all the letters marked **sent** and queries Postel with all of them to get status codes,
     * and updates the stats stored in documents.
     * It's normally called by its CRON job, but no one stops you from calling it yourself.
     *
     * @returns Promise resolved with the number of errors when all the queries are done.
     */
    public async batchQueryLetters(): Promise<number> {
        // Filter only letters that are recent
        const toQuery = (await this.find({ sent: true }, { populate: "sender recipients" }))
            .filter(l => !!l.posteway && (moment().diff(l.sendAt, "months") <= 1));

        if (toQuery.length === 0) {
            logger.info(`Query job has no letters to check! Waiting for the next CRON call...`);
            return 0;
        }

        logger.info(`Time to query PosteWay! I'm gonna ask for info about ${toQuery.length} letters.`);
        let errors = 0;

        for (const letter of toQuery) {
            try {
                await this.queryLetter(letter);
                logger.info("Ok!");
            } catch (err) {
                logger.error(`ARGH! Got an error while trying to query info about letter '${letter.codePdf}'!`, err);
                errors++;
            }
        }

        logger.info(`Done querying Postel.`);
        return errors;
    }

    /**
     * Sends a letter through PosteWay, confirms it, updates everything on the document,
     * and finally returns the updated document with all the info about the order.
     *
     * @param letter {LetterDocument}
     * @param logFile {winston.Logger}
     * @returns {Promise<LetterDocument>} Updated document containing an up-to-date posteway object
     */
    public async sendLetter(letter: LetterDocument, logFile?: winston.Logger): Promise<LetterDocument> {
        logger.info(`--> Sending letter '${letter.codePdf}' <--`);
        await this.updateById(letter.id, { $set: { sent: true }});
        let updated: LetterDocument;

        try {
            const kind = letter.kind === LetterKind.LETTERA_SEMPLICE ? "lol" : "rol";
            const pdf_path = `${PDF_ROOT}/${letter.codePdf}/original.pdf`;
            const pdf_exists: boolean = !!(await fs.promises.stat(pdf_path).catch(() => false));

            if (!pdf_exists) {
                logger.error(`Letter '${letter.codePdf}' does not have a PDF!`);
                logFile?.error(`This letter does not have a PDF! No PDF was found inside ${pdf_path}`);
                throw { error: `This letter does not have a PDF! No PDF was found inside ${pdf_path}` };
            }

            // Upload through PosteWay to get the CID
            const { cid } = await this.posteway.upload(fs.createReadStream(pdf_path));
            await sleep(500);

            // Submit through PosteWay to get the Request ID
            let submit: SubmitResponse;
            try {
                submit = await this.posteway.send({
                    kind: kind,
                    foreign: false, // Needs to be mapped based on recipients
                    sender: mapSenderToPerson(letter.sender as SenderDocument),
                    recipients: letter.recipients.map(mapRecipientToPerson),
                    cid: cid,
                    ar: letter.kind === LetterKind.RACCOMANDATA_AR,
                    options: {
                        bw: letter.bw || false,
                        backSide: letter.backSide || true
                    }
                });
            } catch (err) {
                logFile?.error(`Error while calling PosteWay SEND endpoint`, err);
                logger.error(`Error while calling PosteWay SEND endpoint. Got this error: `, err);
                throw { message: `Error while calling PosteWay SEND endpoint`, error: err };
            }

            if (!submit.ok) {
                logFile?.error(`PosteWay SEND API result was not ok. Got this result: `, submit);
                logger.error(`PosteWay SEND API result was not ok. Got this result: `, submit);
                throw { message: `PosteWay SEND API result was not ok.`, result: submit };
            }

            // Eccolo lo sleep dei 60 secondi
            await sleep(60000);

            // Immediately confirm the request to get the Order ID
            let confirm: ConfirmResponse;
            try {
                confirm = await this.posteway.confirm(kind, submit.request.requestId);
            } catch (err) {
                logFile?.error(`Error while calling PosteWay CONFIRM endpoint`, err);
                logger.error(`Error while calling PosteWay CONFIRM endpoint. Got this error: `, err);
                throw { message: `Error while calling PosteWay CONFIRM endpoint`, error: err };
            }
            await sleep(10000);

            // Call track and recipients to get the info I need to fill the posteway object on document
            let track: TrackResponse;
            try {
                track = await this.posteway.track(kind, confirm.orderId);
            } catch (err) {
                logFile?.error(`Error while calling PosteWay TRACK endpoint`, err);
                logger.error(`Error while calling PosteWay TRACK endpoint. Got this error: `, err);
                throw { message: `Error while calling PosteWay TRACK endpoint`, error: err };
            }

            updated = await this.updateById(letter.id, {
                $set: {
                    posteway: {
                        requestId: submit.request?.requestId,
                        orderId: confirm.orderId,
                        prices: {
                            total: confirm.price?.total,
                            details: confirm.price?.details,
                        },
                        track: track
                    }
                }
            }, false, false);
            logFile?.info(`MongoDB entry for this letter was updated successfully.`, updated.toObject());

            logFile?.info("That's all folks!");
            logFile?.close();
            logger.info(`Ok! Sent letter '${letter.codePdf}'`);

        } catch (err) {
            await this.updateById(letter.id, { $set: { error: true }});
            throw err;
        }

        // Everything went fine, generate provision
        updated.provision = await this.provisionService.generateProvision(letter);
        return await updated.save();
    }

    /**
     * Calls PosteWay to query a particular letter. Calls status, track and recipients.
     * Updates the document and returns the updated one.
     *
     * @param letter {LetterDocument}
     * @returns {Promise<LetterDocument>}
     */
    public async queryLetter(letter: LetterDocument): Promise<LetterDocument> {
        logger.info(`--> Querying letter '${letter.codePdf}' <--`);
        const kind = letter.kind === LetterKind.LETTERA_SEMPLICE ? "lol" : "rol";
        const { orderId } = letter.posteway;

        // Get new tracking info
        const track = await this.posteway.track(kind, orderId);
        return await this.updateById(letter.id, {
            $set: {
                posteway: {
                    ...letter.posteway,
                    track: track,
                }
            }
        }, false, false);
    }

    /**
     * GRAVEYARD -- THE FOLLOWING CODE WAS USED TO QUERY POSTEL ABOUT STATUS CODES. REPLACED IN FAVOR OF POSTEWAY
     * public async batchQueryLetters(): Promise<number> {
        const interestingStatuses = [
            PostelStatus.Approvato,
            PostelStatus.LavorazioneInCorso,
            PostelStatus.DaApprovare,
            PostelStatus.Sospeso
        ];

        const toQuery = (await this.find({ sent: true }, { populate: "sender recipients" }))
            .filter(l => l.stats ? interestingStatuses.includes(l.stats.status) : true);

        if (toQuery.length === 0) {
            logger.info(`Query job has no letters to check! Waiting for the next CRON call...`);
            return 0;
        }

        logger.info(`Time to query Postel! I'm gonna ask for info about ${toQuery.length} letters.`);
        let errors = 0;

        for (const letter of toQuery) {
            if (!letter.stats) {
                logger.warn(`Letter '${letter.codePdf}' has no 'stats' field, but should have one since it was sent. Skipping it, but please check!`);
                continue;
            }
            const stats = letter.stats;
            const wantsRLN = letter.kind !== LetterKind.LETTERA_SEMPLICE;

            try {
                // First call with 1 Set tag and 99 Envelope tags
                const res = await this.postel.query({
                    sets: [{
                        id: letter.uuid,
                        wantsRLN: wantsRLN
                    }],
                    envelopes: stats.envelopes.slice(0, 99).map(e => e.id),
                });
                if (res.globalCode !== 0)
                    throw { message: `MpxQuery API call returned a bad GlobalCode [${res.globalCode}]`, response: res };
                if (!res.sets || !res.sets[0])
                    throw { message: `Expected 'res.sets' array to be filled in response, but it's not.`, response: res };
                if (res.sets[0].code !== 0)
                    throw { message: `Expected SetCode from query to be 0 (OK), was ${res.sets[0].code}`, response: res };

                stats.status = res.sets[0].status || 0;
                stats.dateUploaded = res.sets[0].dateUploaded;
                stats.dateCompleted = res.sets[0].dateCompleted;

                if (wantsRLN && !res.sets[0].regLetterNote) {
                    logger.warn(`Letter '${letter.codePdf}' has kind '${letter.kind}' but I got no response from GetRegLetterNote.`);
                }
                if (wantsRLN && res.sets[0].regLetterNote.code === 0) {
                    // Update tracking code
                    logger.info( `Query for letter '${letter.codePdf}' responded with a RegLetterNote containing ${res.sets[0].regLetterNote.envelopes.length} envelopes! Gathering tracking codes from it...`);
                    stats.envelopes = res.sets[0].regLetterNote.envelopes.map(re => {
                        return {
                            recipient: stats.envelopes.find(se => se.id === re.envelopeID).recipient,
                            id: re.envelopeID,
                            status: 0,
                            dateCompleted: re.dateCompleted,
                            tracking: re.regLetterCode
                        }
                    });
                }

                // Subsequent calls (starting from the 100th envelope) will have 100 max Envelope tags
                if (stats.envelopes.length > 100) {
                    const paginate = (array: Array<any>, page_size: number, page_number: number): Array<any> =>
                        array.slice(page_number * page_size, (page_number + 1) * page_size);

                    const remainingEnvelopes = stats.envelopes.slice(100);
                    const numPages = Math.ceil(remainingEnvelopes.length / 100);

                    for (let page = 0; page < numPages; ++page) {
                        const tempRes = await this.postel.query({
                            envelopes: paginate(remainingEnvelopes, 100, page), sets: []
                        });
                        if (tempRes.globalCode !== 0)
                            throw {
                                message: `MpxQuery API call for subsequent envelopes (page ${page}) returned a bad GlobalCode [${res.globalCode}]`,
                                response: res
                            };

                        res.envelopes = [ ...res.envelopes, ...tempRes.envelopes ];
                    }
                }

                // Order result envelopes by their CustomerEnvelopeID and update
                res.envelopes.sort((a, b) => a.envelopeID - b.envelopeID);
                stats.envelopes = res.envelopes.map(e => {
                    const envelope = stats.envelopes.find(se => se.id === e.envelopeID);
                    return {
                        recipient: envelope.recipient,
                        id: envelope.id || e.envelopeID,
                        status: e.status,
                        dateUploaded: e.dateUploaded,
                        dateCompleted: envelope.dateCompleted || e.dateCompleted,
                        tracking: envelope.tracking, // If present
                    }
                });

                logger.info(`Query for letter '${letter.codePdf}' is done. Updating its database entry...`);
                await this.updateById(letter._id, {
                    $set: { stats: stats }
                });

                // logger.info(`Generating a new invoice for this letter...`);
                // await ioc.resolve(InvoiceService).generateLetterInvoicePDF(letter);

                logger.info("Ok!");
            } catch (err) {
                logger.error(`ARGH! Got an error while trying to query info about letter '${letter.codePdf}'!`, err);
                errors++;
            }
        }

        logger.info(`Done querying Postel.`);
        return errors;
     }
     */

}
