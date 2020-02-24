import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "@services/MongoRepository";
import { Recipient, recipientDecoder, RecipientDocument, RecipientModel } from "@models/RecipientModel";
import { read, utils, WorkBook } from "xlsx";
import { logger } from "@utils/winston";
import httpErrors from "http-errors";
import { inject } from "inversify";
import { MunicipalityService } from "@services/MunicipalityService";
import { MunicipalityDocument } from "@models/MunicipalityModel";
import { AddressDocument } from "@models/schemas/AddressSchema";

@provide(RecipientService)
export class RecipientService extends MongoRepository<Recipient, RecipientDocument> {

    @inject(MunicipalityService) private municipalityService: MunicipalityService;

    constructor(private recipientModel = RecipientModel) {
        super(recipientModel, recipientDecoder);
    }

    public async save(recipient: Recipient): Promise<RecipientDocument> {
        const dup = await this.find({
            user: recipient.user,
            fullName: recipient.fullName,
            address: recipient.address as AddressDocument
        });
        if (dup.length > 0) {
            throw new httpErrors.Conflict("Recipients must be unique on a user basis.");
        }

        return super.save(recipient);
    }

    public async importFromXLSX(xlsx: Buffer, userId: string): Promise<{
        imported: RecipientDocument[],
        errors: Array<{ row: number, description: string, data?: any }>,
        duplicates: number
    }> {
        logger.info(`Requested an import of recipients from XLSX.`);
        const imported: RecipientDocument[] = [];
        const errors: Array<{ row: number, description: string, data?: any }> = [];
        let duplicates = 0;

        const wb: WorkBook = read(xlsx, { type: "buffer" });
        const sheet = Object.values(wb.Sheets).filter(s => !!s)[0];
        if (!sheet) {
            throw new httpErrors.BadRequest("The XLSX file does not have any valid sheet to read data from.");
        }

        const sheetJson = utils.sheet_to_json(Object.values(wb.Sheets)[0]);
        for (let row = 0; row < sheetJson.length; ++row) {
            const value = Object.values(sheetJson[row]);
            // DENOMINAZIONE, INDIRIZZO, CAP, COMUNE, PROVINCIA
            const rowName = value[0], rowStreet = value[1], rowZip = value[2];

            // Validate each possible input
            if (!rowName) {
                errors.push({
                    row: row,
                    description: `Non è stato trovato il nome per questa anagrafica.`
                });
                continue;
            }
            if (rowName.length > 40) {
                errors.push({
                    row: row,
                    description: `Il nome di questa anagrafica è troppo lungo. Deve essere minore di 40 caratteri.`
                });
                continue;
            }
            if (!rowStreet) {
                errors.push({
                    row: row,
                    description: `Non è stato trovato l'indirizzo per questa anagrafica.`
                });
                continue;
            }
            if (rowStreet.length > 40) {
                errors.push({
                    row: row,
                    description: `L'indirizzo di questa anagrafica è troppo lungo. Deve essere minore di 40 caratteri.`
                });
                continue;
            }

            // Query municipalities to determine real name and province
            let municipality: MunicipalityDocument = null;
            try {
                municipality = await this.municipalityService.findOne({ zip: rowZip });
            } catch (err) {
                logger.error(`Got an error while querying for the municipality on row ${row}!`, err);
                errors.push({
                    row: row,
                    description: err.status === 404 ?
                        `Non è stato trovato alcun comune con CAP '${rowZip}'.` :
                        `Non è stato possibile recuperare il comune corrispondente al CAP '${rowZip}'.`,
                    data: err
                });
                continue;
            }

            // Create the new recipient to import
            const recipient: Recipient = {
                user: userId,
                fullName: name,
                address: {
                    street: rowStreet,
                    city: municipality.name,
                    zip: rowZip,
                    province: municipality.province,
                    country: municipality.country
                },
                notes: "Destinatario importato da Excel."
            };

            try {
                const saved = await this.save(recipient);
                imported.push(saved);
            } catch (err) {
                if (err.status === 409) {
                    // This is a duplicate for this user. Skip it
                    duplicates++;
                    continue;
                }

                logger.error(`Got an error while saving a new imported recipient on row ${row}!`, err);
                errors.push({
                    row: row,
                    description: `Non è stato possibile salvare la nuova anagrafica.`,
                    data: err
                });
            }
        }

        logger.info(`Ok! Import job done. I imported ${imported.length} recipient(s), got ${errors.length} error(s) and ${duplicates} duplicate(s). Errors: `, errors);
        return { imported, errors, duplicates };
    }

}
