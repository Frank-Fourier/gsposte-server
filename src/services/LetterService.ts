import { provide } from "inversify-binding-decorators";
import { MongoQuery, MongoRepository } from "@services/MongoRepository";
import { PdfService } from "@services/PdfService";
import { LetterKind, PostelService, PostelStatus } from "@services/PostelService";
import { Letter, letterDecoder, LetterDocument, LetterModel } from "@models/LetterModel";
import { inject } from "inversify";
import { SenderDocument } from "@models/SenderModel";
import { RecipientDocument } from "@models/RecipientModel";
import { generateUUID } from "@utils/random";
import { createLogFile, detachLogFile, logger } from "@utils/winston";
import moment from "moment";
import fs from "fs";

const pdf_root = process.env.PDF_ROOT || "public/pdf/";

@provide(LetterService)
export class LetterService extends MongoRepository<Letter, LetterDocument> {

    @inject(PdfService) pdf: PdfService;
    @inject(PostelService) postel: PostelService;

    constructor(private letterModel = LetterModel) {
        super(letterModel, letterDecoder);
    }

    public async save(letter: Letter): Promise<LetterDocument> {
        const saved = await (await super.save(letter))
            .populate("sender recipients").execPopulate();
        try {
            await this.pdf.formatAndSavePdf(saved);
        } catch (err) {
            await this.deleteById(saved.id);
            throw err;
        }
        return saved;
    }

    public async updateById(id: string, updateBody: (Partial<Letter> | any), upsert: boolean = false): Promise<LetterDocument> {
        const updated = await (await super.updateById(id, updateBody, upsert))
            .populate("sender recipients").execPopulate();
        try {
            await this.pdf.formatAndSavePdf(updated);
        } catch (err) {
            await this.deleteById(updated.id);
            throw err;
        }
        return updated;
    }

    public async updateOne(query: MongoQuery<Letter & LetterDocument>, updateBody: (Partial<Letter> | any), upsert: boolean = false): Promise<LetterDocument> {
        const updated = await (await super.updateOne(query, updateBody, upsert))
            .populate("sender recipients").execPopulate();
        try {
            await this.pdf.formatAndSavePdf(updated);
        } catch (err) {
            await this.deleteById(updated.id);
            throw err;
        }
        return updated;
    }

    /**
     * This function gets all the letters marked as **not sent** and uploads all of them to Postel.
     * It's normally called by its CRON job, but no one stops you from calling it yourself.
     *
     * @returns Promise resolved when all the letters are sent successfully.
     * @throws If something goes wrong while attempting to send
     */
    public async batchUploadLetters(): Promise<void> {
        const toSend = (await this.find({ sent: false }, { populate: "sender recipients" }))
            .filter(l => moment(l.sendAt).isSameOrAfter(moment()));

        logger.info(`Time to send letters! This time I'll send ${toSend.length} letters, using ${process.env.CURRENT_ENVELOPE_ID} as the EnvelopeID base.`);

        for (const letter of toSend) {
            const logFile = createLogFile(`${letter.codePdf}.log`);
            try {
                logger.info(`Sending letter '${letter.codePdf}'...`);

                let pdfBase64 = "";

                const pdf_postel_path = `${pdf_root}${letter.codePdf}_postel.pdf`;
                const pdf_postel_exists: boolean = !!(await fs.promises.stat(pdf_postel_path).catch(() => false));

                if (!pdf_postel_exists) {
                    logger.info(`Letter '${letter.codePdf}' does not have formatted Postel PDF! Creating one...`);
                    logFile.info("This file does not have formatted Postel PDF, hence I'm creating one.");
                    pdfBase64 = await this.pdf.formatAndSavePdf(letter);
                    logFile.info("Postel PDF was created successfully.");
                }

                const uuid = generateUUID();
                logFile.info(`Generated UUID is ${uuid}`);

                const pages = (await this.pdf.metadata(pdf_postel_path)).pages;
                logFile.info(`The formatted PDF file has ${pages} pages. Generating Base64...`);

                if (!pdfBase64) {
                    pdfBase64 = await this.pdf.toBase64(pdf_postel_path);
                }

                const baseEnvelopeID = parseInt(process.env.CURRENT_ENVELOPE_ID || "0") + 1;
                logFile.info(`Generated Base64. BaseEnvelopeID is ${baseEnvelopeID}. Calling Postel to upload...`);

                const postelRes = await this.postel.upload(
                    letter.sender as SenderDocument,
                    letter.recipients as Array<RecipientDocument>, {
                        test: process.env.NODE_ENV !== "production",
                        letterType: letter.kind,
                        setID: uuid,
                        envelopeID: baseEnvelopeID,
                        pdf: {
                            numPages: pages,
                            base64: pdfBase64,
                        }
                    }
                );
                if (!this.postel.isUploadResponseOk(postelRes)) {
                    throw { error: "MpxUpload response is not OK.", response: postelRes };
                }

                process.env.CURRENT_ENVELOPE_ID = (baseEnvelopeID + letter.recipients.length).toString();
                logFile.info(`Postel upload API called successfully, got this result: `, postelRes);

                logFile.info(`Current EnvelopeID is ${process.env.CURRENT_ENVELOPE_ID}. Updating MongoDB entry for this letter...`);
                const updated = await this.updateById(letter._id, {
                    $set: {
                        sent: true,
                        postel: {
                            baseEnvelopeID: baseEnvelopeID,
                            set: {
                                id: uuid,
                                status: 0,
                                envelopes: letter.recipients.map((r: RecipientDocument, index) => {
                                    return {
                                        id: baseEnvelopeID + index,
                                        status: 0
                                    }
                                }).sort((a, b) => a.id - b.id)
                            }
                        }
                    }
                });
                logFile.info(`MongoDB entry for this letter was updated successfully.`, updated);

                logFile.info("That's all folks!");
                logger.info("Ok!");
            } catch (err) {
                logger.error(`ARGH! Got an error while trying to send letter '${letter.codePdf}'!`, err);
                logFile.error(`ARGH! Got an error while sending this letter!`, err);
            } finally {
                detachLogFile(logFile);
            }
        }

        logger.info(`Done sending letters. Current EnvelopeID is: ${process.env.CURRENT_ENVELOPE_ID}!`);
    }

    /**
     * This function gets all the letters marked **sent** and queries Postel with all of them to get status codes,
     * and updates the stats stored in documents.
     * It's normally called by its CRON job, but no one stops you from calling it yourself.
     *
     * @returns Promise resolved when all the queries are done successfully.
     * @throws If something goes wrong while attempting to send
     */
    public async batchQueryLetters(): Promise<void> {
        const interestingStatuses = [
            PostelStatus.Approvato,
            PostelStatus.LavorazioneInCorso,
            PostelStatus.DaApprovare,
        ];

        const toQuery = (await this.find({ sent: true }, { populate: "sender recipients" }))
            .filter(l => l.postel.set ? interestingStatuses.includes(l.postel.set.status) : true);

        logger.info(`Time to query Postel! I'm gonna ask for info about ${toQuery.length} letters.`);

        for (const letter of toQuery) {
            if (!letter.postel) {
                logger.warn(`Letter '${letter.codePdf}' has no 'postel' field, but should have one since it was sent. Skipping it, but please check!`);
                continue;
            }
            const { set } = letter.postel;
            const wantsRLN = letter.kind !== LetterKind.LETTERA_SEMPLICE;

            try {
                // First call with 1 Set tag and 99 Envelope tags
                const res = await this.postel.query({
                    sets: [{
                        id: set.id,
                        wantsRLN: wantsRLN
                    }],
                    envelopes: set.envelopes.slice(0, 99).map(e => e.id),
                });
                if (res.globalCode !== 0)
                    throw { message: `MpxQuery API call returned a bad GlobalCode [${res.globalCode}]`, response: res };
                if (!res.sets || !res.sets[0])
                    throw { message: `Expected 'res.sets' array to be filled in response, but it's not.`, response: res };
                if (res.sets[0].code !== 0)
                    throw { message: `Expected SetCode from query to be 0 (OK), was ${res.sets[0].code}`, response: res };

                set.status = res.sets[0].status || 0;
                set.dateUploaded = res.sets[0].dateUploaded;
                set.dateCompleted = res.sets[0].dateCompleted;

                if (!res.sets[0].regLetterNote && wantsRLN) {
                    logger.warn(`Letter '${letter.codePdf}' has kind '${letter.kind}' but I got no response from GetRegLetterNote.`);
                }


                // Subsequent calls (starting from the 100th envelope) will have 100 max Envelope tags
                if (set.envelopes.length > 100) {
                    const paginate = (array: Array<any>, page_size: number, page_number: number): Array<any> =>
                        array.slice(page_number * page_size, (page_number + 1) * page_size);

                    const remainingEnvelopes = set.envelopes.slice(100);
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
                set.envelopes = res.envelopes.map(e => {
                    return {
                        id: e.envelopeID,
                        status: e.status,
                        dateUploaded: e.dateUploaded,
                        dateCompleted: e.dateCompleted,
                        tracking: 'no' // TODO: Finish this routine
                    }
                });
            } catch (err) {
                logger.error(`ARGH! Got an error while trying to query info about letter '${letter.codePdf}'!`, err);
            }
        }

        logger.info(`Done querying Postel.`);
    }

}
