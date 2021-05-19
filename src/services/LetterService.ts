import { provide } from "inversify-binding-decorators";
import { MongoQuery, MongoRepository, Paginated, PaginateOptions } from "@services/MongoRepository";
import { PdfService } from "@services/PdfService";
import { PriceService } from "@services/PriceService";
import { NoticeService } from "@services/NoticeService";
import { Letter, letterDecoder, LetterDocument, LetterKind, LetterModel } from "@models/LetterModel";
import { inject } from "inversify";
import { mapSenderToPerson, SenderDocument } from "@models/SenderModel";
import { mapRecipientToPerson, RecipientDocument } from "@models/RecipientModel";
import { createLogFile, logger } from "@utils/winston";
import { PosteWayService } from "@services/PosteWayService";
import { sleep } from "@utils/sleep";
import {
    ConfirmResponse,
    PW_Letter,
    PW_LetterDocument,
    StatusResponse,
    SubmitKind,
    SubmitResponse,
    TelegramSubmitResponse,
    TrackResponse
} from "../posteway";
import { isProdEnv, isTestEnv } from "@utils/system";
import { ProvisionService } from "@services/ProvisionService";
import { NoticeKind } from "@models/NoticeModel";
import { UserDocument } from "@models/UserModel";
import { UserService } from "@services/UserService";
import winston from "winston";
import moment from "moment";
import httpErrors from "http-errors";
import { generateRandomCode } from "@utils/random";
import { insert } from "@utils/misc";

@provide(LetterService)
export class LetterService extends MongoRepository<Letter, LetterDocument> {

    @inject(PdfService) private pdf: PdfService;
    @inject(PosteWayService) private posteway: PosteWayService;
    @inject(PriceService) private priceService: PriceService;
    @inject(ProvisionService) private provisionService: ProvisionService;
    @inject(NoticeService) private noticeService: NoticeService;
    @inject(UserService) private userService: UserService;

    constructor(private letterModel = LetterModel) {
        super(letterModel, letterDecoder, [
            "subject", "kind", "codePdf", "notes"
        ]);
    }

    public async save(letter: Letter, depopulate = true): Promise<LetterDocument> {
        const user = await this.userService.findById(
            typeof(letter.user) === "string" ? letter.user : (letter.user as UserDocument)._id
        );
        const recipientsGift = letter.recipientsGift ?? 0;

        if (recipientsGift > letter.recipients.length) {
            throw new httpErrors.BadRequest(`Can't assign more recipients gift than the actual recipients!`);
        }
        if (user.recipientsGift < recipientsGift) {
            throw new httpErrors.Forbidden(`Can't assign more recipients gift than you have! You have ${user.recipientsGift} gifts left.`);
        }

        // Subtract gifts from user
        user.recipientsGift -= letter.recipientsGift ?? 0;
        await user.save();

        // Save the letter
        letter.codePdf = letter.codePdf ?? `GS${generateRandomCode()}`;
        let letterDocument = await (await super.save(letter)).populate("sender recipients").execPopulate();

        // Calculate its price
        letterDocument.price = await this.priceService.calculatePrice(letterDocument);
        await letterDocument.save();

        if (!isTestEnv() && (!letter.sendAt || moment(letter.sendAt).isSameOrBefore(moment()))) {
            // No need to schedule, send everything immediately
            letterDocument = await this.sendLetter(letterDocument, createLogFile(`${letter.codePdf}.log`));
        }

        // Return the document (depopulated based on flag)
        return depopulate ? letterDocument.depopulate("sender recipients") : letterDocument;
    }

    public async updateById(id: string, updateBody: (Partial<Letter> | any), upsert = false, runValidators = true): Promise<LetterDocument> {
        const updated = await (await super.updateById(id, updateBody, upsert, runValidators))
            .populate("sender recipients").execPopulate();

        if (updateBody.recipients || updateBody.kind || updateBody.codePdf) {
            // Need to recalculate price again
            updated.price = await this.priceService.calculatePrice(updated);
            await updated.save();
        }

        return updated;
    }

    public async updateOne(query: MongoQuery<Letter & LetterDocument>, updateBody: (Partial<Letter> | any), upsert = false, runValidators = true): Promise<LetterDocument> {
        const updated = await (await super.updateOne(query, updateBody, upsert, runValidators))
            .populate("sender recipients").execPopulate();

        if (updateBody.recipients || updateBody.kind || updateBody.codePdf) {
            // Need to recalculate price again
            updated.price = await this.priceService.calculatePrice(updated);
            await updated.save();
        }

        return updated;
    }

    public async paginateByPopulateField(collection: string, field: string, text: string, query: any, pagination: PaginateOptions): Promise<Paginated<LetterDocument>> {
        // let $text: string;
        // if (query["$text"]) {
        //     $text = query["$text"];
        //     delete query["$text"];
        // }

        // const match = {
        //     ...(query || {}),
        //     ...($text ? {
        //         $or: this.searchFields.map(field => ({
        //             [field]: {
        //                 $regex: $text,
        //                 $options: "i"
        //             }
        //         }))
        //     } : {})
        // };

        const [{ meta, docs }] = await this.letterModel.aggregate([
            // insert(Object.keys(match).length > 0, { $match: match }, undefined),
            {
                $lookup: {
                    from: collection,
                    let: { [field]: `$${field}` },
                    pipeline: [{ $match: { [field]: new RegExp(text, "i") } }],
                    as: collection
                }
            },
            { $unwind: `$${collection}` },
            // insert(!!pagination.sort, { $sort: pagination.sort }, undefined),
            // insert(!!pagination.select, { $select: pagination.select }, undefined),
            {
                $facet: {
                    meta: [
                        { $count: "total" },
                        { $project: { total: 1, pages: { $divide: [ "$total", pagination.pageSize ] } } }
                    ],
                    docs: [
                        { $skip: pagination.pageIndex * pagination.pageSize },
                        { $limit: pagination.pageSize }
                    ]
                }
            }
        ]).exec();

        return {
            meta: {
                total: meta[0]?.total ?? 0,
                pages: Math.ceil(meta[0]?.pages ?? 0)
            },
            docs: docs ?? []
        };
    }

    public paginateBySenderName(senderName: string, query: any, pagination: PaginateOptions): Promise<Paginated<LetterDocument>> {
        return this.paginateByPopulateField("senders", "name", senderName, query, pagination);
    }

    public paginateByRecipientName(recipientName: string, query: any, pagination: PaginateOptions): Promise<Paginated<LetterDocument>> {
        return this.paginateByPopulateField("recipients", "fullName", recipientName, query, pagination);
    }

    public getOriginalPdfLink(letter: LetterDocument): string | null {
        if (!letter.codePdf) {
            return null;
        }
        const baseUrl = `${process.env.SERVER_HOST}${isProdEnv() ? "" : `:${process.env.SERVER_PORT}`}`;
        return `${baseUrl}/documents/${letter.codePdf}/original.pdf`;
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
                errors++;
            } finally {
                logFile.close();
            }
        }

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
        const toQuery = await this.find({
            sent: true,
            createdAt: { $gte: moment().subtract(30, "days").toDate() },
            error: { $ne: true },
            posteway: { $exists: true }
        }, { populate: "sender recipients" });

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

        return errors;
    }

    /**
     * Sends a letter through PosteWay, confirms it, updates everything on the document,
     * and finally returns the updated document with all the info about the order.
     *
     * LOGICA DI INVIO DELLA LETTERA
     *
     * - Per prima cosa marchio la lettera come inviata (sent impostato a true);
     * - Determino se la lettera è una LOL o una ROL e controllo se il suo file PDF associato esiste;
     * - Se la lettera è una Raccomandata UNO, entra nel circuito PosteWay Coda di Stampa e ritorna;
     * - Se il PDF non esiste tiro l'errore e informo il client WS in ascolto;
     * - Chiamo PosteWay per effettuare l'upload, se va in errore tiro e informo il WS client;
     * - Chiamo PosteWay per effettuare l'invio, se va in errore tiro e informo il WS client;
     * - Se la risposta della chiamata di invio non è OK, tiro e informo il WS client;
     * - Chiamo confirmAndTrackLetter, che si occuperà di aspettare i 60 secondi e poi confermare e tracciare l'invio;
     * - La chiamata normale finisce;
     * - Dentro confirmAndTrackLetter, si aspettano 60 secondi;
     * - Chiamo PosteWay per effettuare la conferma, se va in errore tiro e informo il WS client;
     * - Chiamo PosteWay per effettuare il tracking della lettera, se va in errore tiro e informo il WS client;
     * - Aggiorno l'oggetto letter salvato nel database per includere tutte le info che ho preso da PosteWay;
     * - Calcolo e salvo la provvigione, e la associo alla lettera;
     * - Informo il WS client che la procedura di invio è andata a buon fine, ritornando la lettera aggiornata.
     *
     *
     * @param letter {LetterDocument}
     * @param logFile {winston.Logger}
     * @returns {Promise<LetterDocument>} Updated document containing an up-to-date posteway object
     */
    public async sendLetter(letter: LetterDocument, logFile?: winston.Logger): Promise<LetterDocument> {
        logger.info(`===== SENDING LETTER '${letter.codePdf}' =====`);
        let updated = await this.updateById(letter.id, { $set: { sent: true }});

        const kind = this.chooseSubmitKind(letter.kind);

        if (!kind) {
            logger.error(`[LETTER ${letter.codePdf}] Unrecognized kind. Letter kind is ${letter.kind}. Can't send letter.`);
            logFile?.error(`Unrecognized kind. Letter kind is ${letter.kind}. Can't send letter.`);
            return updated;
        }

        // Populate needed fields
        letter = await letter.populate("user sender recipients").execPopulate();

        const user = letter.user as UserDocument;
        const userId = user?.id;
        if (!userId) {
            logger.error(`[LETTER ${letter.codePdf}] No user associated. Can't send letter.`);
            logFile?.error(`No user associated. Can't send letter.`);
            return updated;
        }

        if (kind === "tol") {
            return this.sendTelegram(letter, userId, logFile);
        }

        if (kind === "runo") {
            return this.sendRUNO(letter, user, logFile);
        }

        const confirmAndTrackLetter = async (submit: SubmitResponse, kind: SubmitKind) => {
            let statusResponse: StatusResponse;
            let confirm: ConfirmResponse;

            try {
                // Wait 60 seconds so I can be sure that the confirm endpoint will work
                await sleep(60000);

                // Before confirming, call status to check if everything went good
                try {
                    statusResponse = await this.posteway.status(kind, submit.request.requestId);

                    // If the status is not R - Prezzato, don't even bother...
                    if (!statusResponse.status.startsWith("R")) {
                        logFile?.error(`Unexpected status response. Expected 'R - Prezzato', got '${statusResponse.status}'. Request ID = ${statusResponse.request.requestId}`);
                        logger.error(`Unexpected status response. Expected 'R - Prezzato', got '${statusResponse.status}'. Request ID = ${statusResponse.request.requestId}`);

                        // Inform the user that there was an error
                        this.noticeService.save({
                            user: userId,
                            title: "Errore durante l'invio della lettera",
                            content: `Errore durante la conferma della lettera '${letter.codePdf}' tramite PosteWay. L'invio non è stato accettato da Poste Italiane, che ha risposto con il codice '${statusResponse.status}'`,
                            data: {
                                requestId: statusResponse.request.requestId,
                                status: statusResponse.status,
                                codePdf: letter.codePdf,
                            },
                            kind: NoticeKind.LETTER,
                            error: true
                        });

                        await this.updateById(letter.id, { $set: { error: true }});
                        return;
                    }
                } catch (err) {
                    logFile?.error(`Error while calling PosteWay STATUS endpoint. This error will be ignored: `, err);
                    logger.error(`Error while calling PosteWay STATUS endpoint. This error will be ignored: `, err);
                }

                // Confirm the request to get the Order ID
                try {
                    confirm = await this.posteway.confirm(kind, submit.request.requestId);
                } catch (err) {
                    logFile?.error(`Error while calling PosteWay CONFIRM endpoint`, err);
                    logger.error(`Error while calling PosteWay CONFIRM endpoint. Got this error: `, err);

                    // Inform the user that there was an error
                    this.noticeService.save({
                        user: userId,
                        title: "Errore durante l'invio della lettera",
                        content: `Errore durante la conferma della lettera '${letter.codePdf}'.`,
                        data: {
                            error: err,
                            codePdf: letter.codePdf,
                        },
                        kind: NoticeKind.LETTER,
                        error: true
                    });

                    throw err;
                }
            } catch (err) {
                await this.updateById(letter.id, { $set: { error: true }});
                return;
            }

            // Wait another 30 seconds so I can be sure that I will have tracking numbers
            await sleep(30000);

            // Call track and recipients to get the info I need to fill the posteway object on document
            let track: TrackResponse;
            try {
                track = await this.posteway.track(kind, confirm.orderId);
            } catch (err) {
                logFile?.error(`Error while calling PosteWay TRACK endpoint`, err);
                logger.error(`[LETTER ${letter.codePdf}] Error while calling PosteWay TRACK endpoint. Got this error: `, err);

                // Inform the user that there was an error
                this.noticeService.save({
                    user: userId,
                    title: "Lettera inviata - Errore di tracciatura",
                    content: `La lettera '${letter.codePdf}' è stata inviata correttamente, ma si è verificato un errore durante il primo tracciamento.`,
                    data: {
                        error: err,
                        codePdf: letter.codePdf,
                    },
                    kind: NoticeKind.LETTER
                });

                return;
            }

            try {
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
            } catch (err) {
                logFile?.error(`Error while updating the letter in Mongo!`, err);
                logger.error(`[LETTER ${letter.codePdf}] Error while updating the letter in Mongo! Got this error: `, err);

                // Inform the user that there was an error
                this.noticeService.save({
                    user: userId,
                    title: "Lettera inviata - Errore di aggiornamento",
                    content: `La lettera '${letter.codePdf}' è stata inviata correttamente, ma si è verificato un errore durante l'aggiornamento del suo stato nel database.`,
                    data: {
                        error: err,
                        codePdf: letter.codePdf,
                    },
                    kind: NoticeKind.LETTER
                });

                return;
            }

            logger.info(`[LETTER ${letter.codePdf}] Ok! The letter was sent correctly. Generating its provision...`);

            // Everything went fine, generate provision
            if (!await this.generateProvision(letter, userId, logFile)) {
                return;
            }

            // Finally inform the client that this letter is ready
            logger.info(`[LETTER ${letter.codePdf}] Provision was generated with ID ${updated?.provision}. Informing WS client that the letter was sent...`);
            this.noticeService.save({
                user: userId,
                title: "Lettera inviata",
                content: `La lettera '${letter.codePdf}' è stata inviata correttamente.`,
                data: {
                    letter: updated,
                    codePdf: letter.codePdf,
                },
                kind: NoticeKind.LETTER
            });

            logFile?.info("That's all folks!");
            logger.info(`[LETTER ${letter.codePdf}] Send routine completed correctly!`);
        };

        try {
            // Submit through PosteWay to get the Request ID
            let submit: SubmitResponse;
            try {
                submit = await this.posteway.send({
                    kind: kind,
                    sender: mapSenderToPerson(letter.sender as SenderDocument, letter.kind, letter.subject),
                    recipients: letter.recipients.map((r: RecipientDocument) => mapRecipientToPerson(r, letter.kind)),
                    recipientAR: letter.recipientAR ? {
                        ...letter.recipientAR,
                        notes: letter.subject
                    } : (
                        (letter.sender as SenderDocument).addressAR
                            ? mapSenderToPerson(letter.sender as SenderDocument, letter.kind, letter.subject, true)
                            : undefined
                    ),
                    // cid: cid,
                    pdf: this.getOriginalPdfLink(letter),
                    options: {
                        bw: letter.bw ?? false,
                        backSide: letter.backSide ?? true,
                        foreign: false, // Needs to be mapped based on recipients
                        ar: letter.kind === LetterKind.RACCOMANDATA_AR,
                        priority: letter.kind === LetterKind.LETTERA_PRIORITARIA,
                    }
                });
            } catch (err) {
                logFile?.error(`Error while calling PosteWay SEND endpoint`, err);
                logger.error(`[LETTER ${letter.codePdf}] Error while calling PosteWay SEND endpoint. Got this error: `, err);

                // Inform the user that there was an error
                this.noticeService.save({
                    user: userId,
                    title: "Errore durante l'invio della lettera",
                    content: `Errore durante la richiesta di invio della lettera '${letter.codePdf}' tramite PosteWay!`,
                    data: {
                        error: err,
                        codePdf: letter.codePdf,
                    },
                    kind: NoticeKind.LETTER,
                    error: true
                });

                throw { message: `Error while calling PosteWay SEND endpoint`, error: err };
            }

            if (!submit.ok) {
                logFile?.error(`PosteWay SEND API result was not ok. Got this result: `, submit);
                logger.error(`[LETTER ${letter.codePdf}] PosteWay SEND API result was not ok. Got this result: `, submit);

                // Inform the user that there was an error
                this.noticeService.save({
                    user: userId,
                    title: "Errore durante l'invio della lettera",
                    content: "La lettera contiene dei campi non validi. Controllare la risposta e riprovare.",
                    data: {
                        result: submit,
                        codePdf: letter.codePdf,
                    },
                    kind: NoticeKind.LETTER,
                    error: true
                });

                throw { message: `PosteWay SEND API result was not ok.`, result: submit };
            }

            // Launch the 60 seconds wait async
            // noinspection ES6MissingAwait
            confirmAndTrackLetter(submit, kind);

        } catch (err) {
            await this.updateById(letter.id, { $set: { error: true }});
            throw err;
        }

        return updated;
    }

    /**
     * Calls PosteWay to query a particular letter. Calls status, track and recipients.
     * Updates the document and returns the updated one.
     *
     * @param letter {LetterDocument}
     * @returns {Promise<LetterDocument>}
     */
    public async queryLetter(letter: LetterDocument): Promise<LetterDocument> {
        logger.info(`===== QUERYING LETTER '${letter.codePdf}' =====`);

        const kind = this.chooseSubmitKind(letter.kind);

        // Need to query this from CDS (since it's a RUNO)
        if (kind === "runo") {
            const { docs } = await this.posteway.cds_find(letter.codePdf);
            return this.updateById(letter.id, {
                $set: {
                    "posteway.track": {
                        recipients: docs.map(letter => ({
                            id: letter._id,
                            person: letter.recipient,
                            tracking: {
                                number: letter.tracking,
                                status: letter.status,
                                date: !!letter.printDate ?
                                    moment(letter.printDate).format("DD/MM/YYYY HH:mm:ss") : undefined,
                            }
                        }))
                    }
                }
            });
        }

        // Need to query this from telegrams endpoint
        if (kind === "tol") {
            const { requestId } = letter.posteway;
            const { telegrams } = await this.posteway.status_telegram(requestId);
            return this.updateById(letter.id, {
                $set: { "posteway.telegram.status": telegrams }
            });
        }

        // Query from Poste Italiane in case of LOL/ROL
        const { requestId, orderId } = letter.posteway;

        const track = await this.posteway.track(kind, orderId);
        const status = await this.posteway.status(kind, requestId).catch(() => null);

       const temporary = {
           // Do not update prices if the status call errored
           ...(!!status ? { "posteway.prices": status.price } : {}),
           "posteway.track": track,
       };

        return this.updateById(letter.id, temporary, false, false);
    }

    private async sendRUNO(letter: LetterDocument, user: UserDocument, logFile?: winston.Logger): Promise<LetterDocument> {
        // Enter CDS lane, create bulk letters (order is preserved in Promise.all)
        const pdf = this.getOriginalPdfLink(letter);
        const { pages, letters } = await this.posteway.cds_create_bulk(
            letter.recipients.map<PW_Letter>((recipient: RecipientDocument) => ({
                platform: "GSPoste",
                code: letter.codePdf,
                kind: "runo",
                sender: mapSenderToPerson(letter.sender as SenderDocument, letter.kind, letter.subject),
                recipient: mapRecipientToPerson(recipient, letter.kind),
                recipientAR: letter.recipientAR ? {
                    ...letter.recipientAR,
                    notes: letter.subject
                } : (
                    (letter.sender as SenderDocument).addressAR
                        ? mapSenderToPerson(letter.sender as SenderDocument, letter.kind, letter.subject, true)
                        : undefined
                ),
                pdf: pdf,
                options: {
                    bw: letter.bw ?? true,
                    backSide: letter.backSide ?? true,
                    ar: letter.kind === LetterKind.RACCOMANDATA_UNO_AR,
                },
                avatarUrl: user.avatar,
            })), pdf
        );

        const net = letters.reduce((acc: number, cur: PW_LetterDocument) => acc + cur.price, 0);
        const tax = (net * 22) / 100;
        const tot = net + tax;

        // Update letter's PosteWay object and return
        const updated = await this.updateById(letter.id, {
            $set: {
                posteway: {
                    prices: {
                        pages: pages,
                        total: {
                            cur: "EUR",
                            net, tax, tot
                        }
                    },
                    track: {
                        recipients: letters.map(letter => ({
                            id: letter._id,
                            person: letter.recipient,
                            tracking: {
                                number: letter.tracking,
                                status: letter.status,
                            }
                        }))
                    }
                }
            }
        }, false, false);

        // Everything went fine, generate provision
        if (!await this.generateProvision(letter, user.id, logFile)) {
            return;
        }

        // Finally inform the client that this letter is ready
        logger.info(`[LETTER ${letter.codePdf}] Provision was generated with ID ${updated?.provision}.`);

        return updated;
    }

    private async sendTelegram(letter: LetterDocument, userId: string, logFile?: winston.Logger): Promise<LetterDocument> {
        let updated: LetterDocument;

        // Enter Telegramma lane
        if (!letter.text) {
            logFile?.error(`This telegram does not have text.`);
            logger.error(`[TELEGRAM ${letter.codePdf}] This telegram does not have text.`);

            // Inform the user that there was an error
            this.noticeService.save({
                user: userId,
                title: "Errore durante l'invio del telegramma",
                content: "Non è possibile inviare un telegramma privo di testo.",
                data: {},
                kind: NoticeKind.LETTER,
                error: true
            });

            throw { message: `This telegram does not have text.` };
        }

        let submit: TelegramSubmitResponse;
        try {
            submit = await this.posteway.send_telegram({
                sender: mapSenderToPerson(letter.sender as SenderDocument, letter.kind, letter.subject),
                recipients: letter.recipients.map((r: RecipientDocument) => mapRecipientToPerson(r, letter.kind)),
                text: letter.text,
                notes: letter.subject,
                showSenderAddress: false,
            });
        } catch (err) {
            logFile?.error(`Error while calling PosteWay TELEGRAM SEND endpoint`, err);
            logger.error(`[TELEGRAM ${letter.codePdf}] Error while calling PosteWay TELEGRAM SEND endpoint. Got this error: `, err);

            // Inform the user that there was an error
            this.noticeService.save({
                user: userId,
                title: "Errore durante l'invio del telegramma",
                content: `Errore durante la richiesta di invio del telegramma '${letter.codePdf}'.`,
                data: { error: err },
                kind: NoticeKind.LETTER,
                error: true
            });

            throw { message: `Error while calling PosteWay TELEGRAM SEND endpoint`, error: err };
        }

        if (!submit.ok) {
            logFile?.error(`PosteWay TELEGRAM SEND API result was not ok. Got this result: `, submit);
            logger.error(`[TELEGRAM ${letter.codePdf}] PosteWay TELEGRAM SEND API result was not ok. Got this result: `, submit);

            // Inform the user that there was an error
            this.noticeService.save({
                user: userId,
                title: "Errore durante l'invio del telegramma",
                content: "Il telegramma contiene dei campi non validi.",
                data: { result: submit },
                kind: NoticeKind.LETTER,
                error: true
            });

            throw { message: `PosteWay TELEGRAM SEND API result was not ok.`, result: submit };
        }

        updated = await this.updateById(letter.id, {
            $set: {
                posteway: {
                    requestId: submit.requestId,
                    telegram: {
                        text: submit.submitResult.text,
                        price: submit.submitResult.price
                    }
                }
            }
        });

        try {
            const { telegrams } = await this.posteway.status_telegram(submit.requestId);
            updated = await this.updateById(letter.id, {
                $set: { "posteway.telegram.status": telegrams }
            });
        } catch (err) {
            logFile?.error(`Error while calling PosteWay TELEGRAM STATUS endpoint`, err);
            logger.error(`[TELEGRAM ${letter.codePdf}] Error while calling PosteWay TELEGRAM STATUS endpoint. Got this error: `, err);

            // Inform the user that there was an error
            this.noticeService.save({
                user: userId,
                title: "Errore durante la richiesta di stato del telegramma",
                content: `Errore durante la richiesta di stato del telegramma '${letter.codePdf}'.`,
                data: { error: err },
                kind: NoticeKind.LETTER,
                error: true
            });

            throw { message: `Error while calling PosteWay TELEGRAM STATUS endpoint`, error: err };
        }

        try {
            const { tickets } = await this.posteway.confirm_telegram(submit.requestId);
            updated = await this.updateById(letter.id, {
                $set: { "posteway.telegram.tickets": tickets }
            });
        } catch (err) {
            logFile?.error(`Error while calling PosteWay TELEGRAM CONFIRM endpoint`, err);
            logger.error(`[TELEGRAM ${letter.codePdf}] Error while calling PosteWay TELEGRAM CONFIRM endpoint. Got this error: `, err);

            // Inform the user that there was an error
            this.noticeService.save({
                user: userId,
                title: "Errore durante la richiesta di conferma del telegramma",
                content: `Errore durante la richiesta di conferma del telegramma '${letter.codePdf}'.`,
                data: { error: err },
                kind: NoticeKind.LETTER,
                error: true
            });

            throw { message: `Error while calling PosteWay TELEGRAM CONFIRM endpoint`, error: err };
        }

        // Everything went fine, generate provision
        if (!await this.generateProvision(letter, userId, logFile)) {
            return;
        }

        // Finally inform the client that this letter is ready
        logger.info(`[TELEGRAM ${letter.codePdf}] Provision was generated with ID ${updated?.provision}.`);

        return updated;
    }

    private async generateProvision(letter: LetterDocument, userId: string, logFile?: winston.Logger): Promise<boolean> {
        try {
            letter.provision = await this.provisionService.generateProvision(letter);
            await letter.save();
            return true;
        } catch (err) {
            logFile?.error(`Error while generating the provision!`, err);
            logger.error(`[LETTER ${letter.codePdf}] Error while generating the provision for letter '${letter.codePdf}'! Got this error: `, err);

            // Inform the user that there was an error
            this.noticeService.save({
                user: userId,
                title: "Invio effettuato - Generazione cashback fallita",
                content: `${letter.isTelegramma() ? 'Il telegramma' : 'La lettera'} '${letter.codePdf}' è stata inviata correttamente, ma non è stato possibile generare il suo cashback.`,
                data: {
                    error: err,
                    ...insert(!letter.isTelegramma(), { codePdf: letter.codePdf }, {})
                },
                kind: NoticeKind.LETTER
            });

            return;
        }
    }

    private chooseSubmitKind(kind: LetterKind): SubmitKind {
        switch (kind) {
            case LetterKind.LETTERA_SEMPLICE:
            case LetterKind.LETTERA_PRIORITARIA:
                return "lol";
            case LetterKind.RACCOMANDATA:
            case LetterKind.RACCOMANDATA_AR:
                return "rol";
            case LetterKind.RACCOMANDATA_UNO:
            case LetterKind.RACCOMANDATA_UNO_AR:
                return "runo";
            case LetterKind.TELEGRAMMA:
                return "tol";
        }
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
