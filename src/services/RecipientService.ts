import { provide } from "inversify-binding-decorators";
import { MongoQuery, MongoRepository } from "@services/MongoRepository";
import { Recipient, recipientDecoder, RecipientDocument, RecipientModel } from "@models/RecipientModel";
import { read, write, utils, WorkBook } from "xlsx";
import { logger } from "@utils/winston";
import httpErrors from "http-errors";
import { inject } from "inversify";
import { MunicipalityService } from "@services/MunicipalityService";
import { MunicipalityDocument } from "@models/MunicipalityModel";
import { AddressDocument } from "@models/schemas/AddressSchema";
import { Request, Response } from "express";
import multer, { diskStorage, MulterError } from "multer";

/**
 * @swagger
 *
 * definitions:
 *   RecipientsImportResponse:
 *     type: object
 *     properties:
 *       imported:
 *         type: array
 *         items:
 *           $ref: "#/definitions/RecipientDocument"
 *       errors:
 *         type: array
 *         items:
 *           type: object
 *           properties:
 *             row:
 *               type: number
 *               example: 4
 *             description:
 *               type: string
 *               example: "Il campo 'Indirizzo' supera la lunghezza massima consentita (40)"
 */
export interface RecipientsImportResponse {
    imported: Array<RecipientDocument>,
    errors: Array<{ row: number, description: string, data?: any }>
}

type Validator = (value: string, ...params: any[]) => { valid: boolean, error: string };

// Setup XLSX upload middleware
const xlsxUploader = multer({
    storage: diskStorage({
        destination: process.env.XLSX_ROOT || "public/xlsx",
        filename(req: Request, file: Express.Multer.File, callback: (error: (Error | null), filename: string) => void): void {
            callback(null, `${file.originalname.substr(0, file.originalname.lastIndexOf("."))}_${+new Date()}.${file.originalname.substr(file.originalname.lastIndexOf(".") + 1)}`);
        }
    }),
    limits: {
        files: 1,
        fileSize: 50 * 1000 * 1000 // ~50MB
    },
    // The file filter will only accept XLS(X) files
    fileFilter(req: Request, file: Express.Multer.File, callback: (error: (Error | null), acceptFile: boolean) => void): void {
        if (file.mimetype !== "application/vnd.ms-excel" && file.mimetype !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
            return callback(null, false);
        }
        callback(null, true);
    }
}).single("file");

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

    /**
     * Utility method to simplify the Multer upload routine
     * Call this directly from Controller with req and res params
     *
     * @param req {Request} Express Request object
     * @param res {Response} Express Response object
     * @returns Promise resolved with XLSX file name when the upload is done. Throws with status code if the upload fails
     */
    public upload(req: Request, res: Response): Promise<string> {
        return new Promise(((resolve, reject) => {
            xlsxUploader(req, res, (err: MulterError | any) => {
                if (!req.file) {
                    logger.error("A file upload request was not accepted. Only XLSX files are acceptable.");
                    return reject(new httpErrors.NotAcceptable("Only XLSX files are acceptable for upload."));
                }

                // Check if a Multer specific error occured while uploading (likely file did not meet criteria)
                if (err instanceof MulterError) {
                    logger.error(`Got MulterError while uploading an XLSX file [${err.code}]: ${err.message}`);
                    switch (err.code) {
                        case "LIMIT_FILE_COUNT":
                            return reject(new httpErrors.BadRequest("More than one file field was passed to this upload request."));
                        case "LIMIT_FILE_SIZE":
                            return reject(new httpErrors.PayloadTooLarge("The provided file is too heavy. Only file sizes < 50MB are acceptable for upload."));
                        case "LIMIT_UNEXPECTED_FILE":
                            return reject(new httpErrors.NotAcceptable("Only XLSX files are acceptable for upload."));
                    }
                    return reject(new httpErrors.BadRequest(`Generic error while uploading: ${err.message} [${err.code}]`));
                } else if (err) {
                    // There is an even more generic error!
                    logger.error(`Generic error while uploading an XLSX file: ${err}`);
                    return reject(new httpErrors.BadRequest(`Generic error while uploading: ${err}`));
                }

                // Everything went fine
                logger.info(`A new XLSX was uploaded with filename '${req.file.filename}'.`);
                return resolve(req.file.filename);
            });
        }));
    }

    /**
     * Import a set of recipients from an XLSX file
     *
     * @param xlsx {Buffer} Entire XLSX document
     * @param userId {string} Owner of the imported recipients
     * @returns {Promise<{ imported: Array<RecipientDocument>, errors: Array<{ row: number, description: string, data?: any }> }> } Promise resolved when the whole document is traversed and contacts are imported. Contains all the errors that occured during the process.
     */
    public async importFromXLSX(xlsx: Buffer, userId: string): Promise<RecipientsImportResponse> {
        logger.info(`Requested an import of recipients from XLSX.`);

        const imported: Array<RecipientDocument> = [];
        const errors: Array<{ row: number, description: string, data?: any }> = [];

        const wb: WorkBook = read(xlsx, { type: "buffer" });
        const sheet = Object.values(wb.Sheets).filter(s => !!s)[0];
        if (!sheet) {
            throw new httpErrors.BadRequest("The XLSX file does not have any valid sheet to read data from.");
        }

        const validators = {
            notEmpty: (field: string) => (value: string) => ({
                valid: !!value,
                error: `Il campo '${field}' è obbligatorio`
            }),
            maxLength: (field: string, max: number) => (value: string) => ({
                valid: value ? value.length <= max : true,
                error: `Il campo '${field}' supera la lunghezza massima consentita (${max})`
            }),
        };

        const sheetJson = utils.sheet_to_json(sheet);
        for (let row = 0; row < sheetJson.length; ++row) {
            const value = Object.values(sheetJson[row]);
            const cellValue = (col: number) => value[col] ? String(value[col]) : null;

            // DENOMINAZIONE, INDIRIZZO, CAP, COMUNE, PROVINCIA
            const rowName     = cellValue(0),
                  rowStreet   = cellValue(1),
                  rowZip      = cellValue(2),
                  rowCityName = cellValue(3);

            const validateCell = (val: string, validators: Validator[]) =>
                validators.filter(v => !v(val).valid).map(nv => {
                    errors.push({ row: row + 2, description: nv(val).error });
                    return nv;
                }).length === 0;

            if (!validateCell(rowName, [ validators.notEmpty("Denominazione"), validators.maxLength("Denominazione", 40) ])) continue;
            if (!validateCell(rowStreet, [ validators.notEmpty("Indirizzo"), validators.maxLength("Indirizzo", 40) ])) continue;
            if (!validateCell(rowZip, [ validators.notEmpty("CAP"), validators.maxLength("CAP", 5) ])) continue;
            if (!validateCell(rowCityName, [ validators.notEmpty("Comune"), validators.maxLength("Comune", 40) ])) continue;

            // Query municipality
            let municipality: MunicipalityDocument = null;
            try {
                municipality = await this.municipalityService.findOne({
                    name: {
                        $regex: `^${rowCityName}$`, $options: "i"
                    }
                } as object);
            } catch (err) {
                if (err.status !== 404) logger.error(`Got an error while querying for the municipality on row ${row + 2}! ${err}`);
                errors.push({
                    row: row + 2,
                    description: err.status === 404 ?
                        `Non è stato trovato alcun comune di nome '${rowCityName}'. Potrebbe essere necessario richiedere l'inserimento di questo comune nel sistema tramite l'apposito modulo.` :
                        `Errore durante la ricerca del comune di nome '${rowCityName}' nel database.`,
                    data: err.status === 404 ? undefined : (err.message || err)
                });
                continue;
            }

            // Found the municipality in db, check the zip code
            if (!municipality.zip.includes(rowZip)) {
                errors.push({
                    row: row + 2,
                    description: `Il CAP ${rowZip} per ${rowCityName} non corrisponde ad alcun CAP registrato per questo comune.`
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
                notes: "Contatto importato da Excel."
            };

            try {
                const saved = await this.save(recipient);
                imported.push(saved);
            } catch (err) {
                if (err.status === 409) {
                    // This is a duplicate for this user. Skip it
                    errors.push({
                        row: row + 2,
                        description: `Contatto duplicato!`
                    });
                    continue;
                }

                logger.error(`Got an error while saving a new imported recipient on row ${row + 2}!`, err);
                errors.push({
                    row: row + 2,
                    description: `Non è stato possibile salvare la nuova anagrafica nel sistema.`,
                    data: err.message || err
                });
            }
        }

        logger.info(`Ok! Import job done. I imported ${imported.length} recipient(s), got ${errors.length} error(s). Errors: `, errors);
        return { imported, errors };
    }

    /**
     * Export a set of recipients to an XLSX file
     *
     * @param query {MongoQuery<RecipientDocument>} Filter recipients to export
     * @returns {Promise<Buffer>} Promise resolving to exported XLSX file as buffer
     */
    public async exportToXLSX(query: MongoQuery<RecipientDocument> | object): Promise<Buffer> {
        logger.info(`Requested an export of recipients to XLSX.`);
        const recipients = await this.find(query);

        const workbook = utils.book_new();
        const worksheet = utils.json_to_sheet(recipients.map(rec => ({
            DENOMINAZIONE: rec.fullName,
            INDIRIZZO: rec.address.street,
            CAP: rec.address.zip,
            COMUNE: rec.address.city,
            PROVINCIA: rec.address.province
        })), {
            header: [ "DENOMINAZIONE", "INDIRIZZO", "CAP", "COMUNE", "PROVINCIA" ]
        });
        worksheet["!cols"] = [ { wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 10 } ];

        utils.book_append_sheet(workbook, worksheet, "Anagrafiche");
        const buffer = write(workbook, {
            type: "buffer",
            bookType: "xlsx"
        });

        logger.info(`Ok! Export job done. I exported ${recipients.length} recipient(s).`);
        return buffer;
    }

}
