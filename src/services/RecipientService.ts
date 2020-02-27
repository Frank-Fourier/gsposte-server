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

type Validator =  { validate: (value: string) => boolean, error: string };

@provide(RecipientService)
export class RecipientService extends MongoRepository<Recipient, RecipientDocument> {

    @inject(MunicipalityService) private municipalityService: MunicipalityService;

    constructor(private recipientModel = RecipientModel) {
        super(recipientModel, recipientDecoder, [
            "fullName", "address.street", "address.secondary", "address.city",
            "address.zip", "address.province", "address.country", "notes"
        ]);
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

        const validators = {
            notEmpty: () => (value: string) => !!value,
            maxLength: (max: number) => (value: string) => value.length < max,
        };

        const sheetJson = utils.sheet_to_json(sheet);
        for (let row = 0; row < sheetJson.length; ++row) {
            const value = Object.values(sheetJson[row]);
            // DENOMINAZIONE, INDIRIZZO, CAP, COMUNE, PROVINCIA
            const rowName     = String(value[0]),
                  rowStreet   = String(value[1]),
                  rowZip      = String(value[2]),
                  rowCityName = String(value[3]);
                  // rowProvince = String(value[4]);

            const validateRow = (rowVal: string, validators: Validator[]) =>
                validators.filter(v => !v.validate(rowVal)).map(nv => {
                    errors.push({ row: row + 2, description: nv.error });
                    return nv;
                }).length === 0;

            validateRow(rowName, [{
                validate: validators.notEmpty(),
                error: `Non è stato trovato il nome per questa anagrafica.`
            }]);

            if (!rowName) {
                errors.push({
                    row: row + 2,
                    description: `Non è stato trovato il nome per questa anagrafica.`
                });
                continue;
            }
            if (rowName.length > 40) {
                errors.push({
                    row: row + 2,
                    description: `Il nome di questa anagrafica è troppo lungo. Deve essere minore di 40 caratteri.`
                });
                continue;
            }
            if (!rowStreet) {
                errors.push({
                    row: row + 2,
                    description: `Non è stato trovato l'indirizzo per questa anagrafica.`
                });
                continue;
            }
            if (rowStreet.length > 40) {
                errors.push({
                    row: row + 2,
                    description: `L'indirizzo di questa anagrafica è troppo lungo. Deve essere minore di 40 caratteri.`
                });
                continue;
            }

            // Query municipality
            let municipality: MunicipalityDocument = null;
            try {
                municipality = await this.municipalityService.findOne({
                    $text: {
                        $search: rowCityName,
                        $language: "none"
                    },
                });
            } catch (err) {
                logger.error(`Got an error while querying for the municipality on row ${row + 2}! ${err}`);
                errors.push({
                    row: row + 2,
                    description: err.status === 404 ?
                        `Non è stato trovato alcun comune di nome '${rowCityName}'. Potrebbe essere necessario richiedere l'inserimento di questo comune nel sistema, tramite l'apposito modulo.` :
                        `Errore durante la ricerca del comune di nome '${rowCityName}' nel database.`,
                    data: err.message || err
                });
                continue;
            }

            // Found the municipality in db, check the zip code
            if (rowZip !== municipality.zip) {
                errors.push({
                    row: row + 2,
                    description: `Il CAP corrispondente al comune riportato (${rowZip} per ${rowCityName}) non corrisponde al CAP registrato nel sistema.`,
                    data: {
                        municipality: municipality,
                        rowZip: rowZip
                    }
                });
                continue;
            }

            // Create the new recipient to import
            const recipient: Recipient = {
                user: userId,
                fullName: rowName,
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

                logger.error(`Got an error while saving a new imported recipient on row ${row + 2}!`, err);
                errors.push({
                    row: row + 2,
                    description: `Non è stato possibile salvare la nuova anagrafica.`,
                    data: err.message || err
                });
            }
        }

        logger.info(`Ok! Import job done. I imported ${imported.length} recipient(s), got ${errors.length} error(s) and ${duplicates} duplicate(s). Errors: `, errors);
        return { imported, errors, duplicates };
    }

}
