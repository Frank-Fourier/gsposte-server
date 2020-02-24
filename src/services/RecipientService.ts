import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "@services/MongoRepository";
import { Recipient, recipientDecoder, RecipientDocument, RecipientModel } from "@models/RecipientModel";
import { read, utils, WorkBook } from "xlsx";
import { logger } from "@utils/winston";
import httpErrors from "http-errors";

@provide(RecipientService)
export class RecipientService extends MongoRepository<Recipient, RecipientDocument> {

    constructor(private recipientModel = RecipientModel) {
        super(recipientModel, recipientDecoder);
    }

    public async importFromXLSX(xlsx: Buffer, userId: string): Promise<{
        imported: RecipientDocument[],
        errors: Array<{
            row: number
            description: string
        }>
    }> {
        logger.info(`Requested a Recipients import from XLSX.`);
        const imported: RecipientDocument[] = [];
        const errors: Array<{ row: number, description: string  }> = [];

        const wb: WorkBook = read(xlsx, { type: "buffer" });
        const sheet = Object.values(wb.Sheets).filter(s => !!s)[0];
        if (!sheet) {
            throw new httpErrors.BadRequest("The XLSX file does not have any valid sheet to read data from.");
        }

        const sheetJson = utils.sheet_to_json(Object.values(wb.Sheets)[0]);
        for (let row = 0; row < sheetJson.length; ++row) {
            const value = Object.values(sheetJson[row]);
            // DENOMINAZIONE, INDIRIZZO, CAP, COMUNE, PROVINCIA
            /*const recipient: Recipient = {
                user: userId,
                fullName: value[0],
                address: {
                    street: value[1],

                },
                notes: "Destinatario importato da un file Excel."
            }*/
        }

        logger.info(`Ok! Import job done. I imported ${imported.length} recipient(s), got ${errors.length} errors.`, errors);
        return { imported, errors };
    }

}
