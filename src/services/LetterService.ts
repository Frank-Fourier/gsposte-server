import { provide } from "inversify-binding-decorators";
import { MongoQuery, MongoRepository } from "@services/MongoRepository";
import { PdfService } from "@services/PdfService";
import { PostelService } from "@services/PostelService";
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

    public async sendLettersBatch(): Promise<void> {
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

                const baseEnvelopeID = parseInt(process.env.CURRENT_ENVELOPE_ID || "0");
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
                    throw { error: "Postel API upload response was not OK.", response: postelRes };
                }

                process.env.CURRENT_ENVELOPE_ID = (baseEnvelopeID + letter.recipients.length).toString();
                logFile.info(`Postel upload API called successfully, got this result: `, postelRes);

                logFile.info(`Current EnvelopeID is ${process.env.CURRENT_ENVELOPE_ID}. Updating MongoDB entry for this letter...`);
                const updated = await this.updateById(letter._id, {
                    $set: {
                        sent: true,
                        postel: {
                            setID: uuid,
                            baseEnvelopeID: parseInt(process.env.CURRENT_ENVELOPE_ID || "0"),
                        }
                    },
                });
                logFile.info(`MongoDB entry for this letter was updated successfully.`, updated);

                logFile.info("That's all folks!");
                logger.info("Ok!");
            } catch (err) {
                logger.error(`Unfortunately I got an error while trying to send letter '${letter.codePdf}'...`, err);
                logFile.error(`ARGH! Got an error while sending this letter!`, err);
            } finally {
                detachLogFile(logFile);
            }
        }

        logger.info(`Done sending letters. Current EnvelopeID is: ${process.env.CURRENT_ENVELOPE_ID}!`);
    }

}
