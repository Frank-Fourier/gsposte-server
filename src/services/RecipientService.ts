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
import { CellValidator, ImportResponse, uploadXLSX, validators } from "@utils/xlsx-uploader";
import { RubricService } from "@services/RubricService";

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
export type RecipientsImportResponse = ImportResponse<RecipientDocument>

export interface RecipientXLSX {
    DENOMINAZIONE: string
    INDIRIZZO: string
    CAP: string
    COMUNE: string
    PROVINCIA: string
    USERNAME?: string
    PASSWORD?: string
    EMAIL?: string
    "CODICE FISCALE"?: string
    RUBRICA: string

    // FORMATO EXCEL DANEA
    Denominazione?: string // -> Denominazione
    Indirizzo?: string // -> INDIRIZZO
    Città?: string // -> COMUNE
    Prov?: string // -> PROVINCIA
    CodFisc?: string // -> CODICE FISCALE
    Email?: string // -> EMAIL
    Pec?: string
    Tel1?: string
    Tel2?: string
    Tel3?: string
    Note?: string
    // Spedizioni: Se presente, ha la priorità su Indirizzo standard
    "Spedizioni: nome"?: string
    "Spedizioni: Indirizzo"?: string // -> INDIRIZZO
    "Spedizioni: CAP"?: string // -> CAP
    "Spedizioni: Città"?: string // -> COMUNE
    "Spedizioni: Prov"?: string // -> PROVINCIA
}

@provide(RecipientService)
export class RecipientService extends MongoRepository<Recipient, RecipientDocument> {

    @inject(MunicipalityService) private municipalityService: MunicipalityService;
    @inject(RubricService) private rubricService: RubricService;

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
        return uploadXLSX(req, res);
    }

    /**
     * Import a set of recipients from an XLSX file
     *
     * @param xlsx {Buffer} Entire XLSX document
     * @param userId {string} Owner of the imported recipients
     * @param fileName {string} [Optional] Original XLSX document file name
     * @returns {Promise<{ imported: Array<RecipientDocument>, errors: Array<{ row: number, description: string, data?: any }> }> } Promise resolved when the whole document is traversed and contacts are imported. Contains all the errors that occured during the process.
     */
    public async importFromXLSX(xlsx: Buffer, userId: string, fileName?: string): Promise<RecipientsImportResponse> {
        logger.info(`Requested an import of recipients from XLSX.`);

        const imported: Array<RecipientDocument> = [];
        const errors: Array<{ row: number, description: string, data?: any }> = [];

        const wb: WorkBook = read(xlsx, { type: "buffer" });
        const sheet = Object.values(wb.Sheets).filter(s => !!s)[0];
        if (!sheet) {
            throw new httpErrors.BadRequest("The XLSX file does not have any valid sheet to read data from.");
        }

        const sheetJson = utils.sheet_to_json(sheet);
        for (let row = 0; row < sheetJson.length; ++row) {
            const data: RecipientXLSX = sheetJson[row] as RecipientXLSX;
            const cellValue = (columnName: keyof RecipientXLSX) =>
                data[columnName] ? String(data[columnName]).trim() : null;

            const rowName     = cellValue("Spedizioni: nome") || cellValue("DENOMINAZIONE") || cellValue("Denominazione"),
                  rowStreet   = cellValue("Spedizioni: Indirizzo") || cellValue("INDIRIZZO") || cellValue("Indirizzo"),
                  rowZip      = cellValue("Spedizioni: CAP") || cellValue("CAP"),
                  rowCityName = cellValue("Spedizioni: Città") || cellValue("COMUNE") || cellValue("Città"),
                  // rowProvince = cellValue("Spedizioni: Prov") ?? cellValue("PROVINCIA") ?? cellValue("Prov"), -- NOT USED
                  rowUsername = cellValue("USERNAME"),
                  rowPassword = cellValue("PASSWORD"),
                  rowEmail    = cellValue("EMAIL") || cellValue("Email"),
                  rowPEC      = cellValue("Pec"),
                  rowCf       = cellValue("CODICE FISCALE") || cellValue("CodFisc"),
                  rowRubric   = cellValue("RUBRICA"),
                  rowNotes    = cellValue("Note");

            // 3 phone numbers
            const rowPhoneNumber = [ cellValue("Tel1"), cellValue("Tel2"), cellValue("Tel3") ]
               .filter(tel => tel?.replace(/[^\d-]/gi, "").trim().startsWith("3"))?.[0];

            const validateCell = (val: string, validators: CellValidator[]) =>
                validators.filter(v => !v(val).valid).map(nv => {
                    errors.push({ row: row + 2, description: nv(val).error });
                    return nv;
                }).length === 0;

            if (!validateCell(rowName, [ validators.notEmpty("DENONIMAZIONE"), validators.maxLength("DENONIMAZIONE", 40) ])) continue;
            if (!validateCell(rowStreet, [ validators.notEmpty("INDIRIZZO"), validators.maxLength("INDIRIZZO", 40) ])) continue;
            if (!validateCell(rowZip, [ validators.notEmpty("CAP"), validators.maxLength("CAP", 5) ])) continue;
            if (!validateCell(rowCityName, [ validators.notEmpty("COMUNE"), validators.maxLength("COMUNE", 40) ])) continue;
            if (!validateCell(rowEmail, [ validators.maxLength("EMAIL", 100) ])) continue;
            if (!validateCell(rowPEC, [ validators.maxLength("PEC", 100) ])) continue;
            if (!validateCell(rowCf, [ validators.maxLength("CODICE FISCALE", 16) ])) continue;
            if (!validateCell(rowNotes, [ validators.maxLength("NOTE", 250) ])) continue;
            if (!validateCell(rowPhoneNumber, [ validators.maxLength("TELEFONO", 30) ])) continue;

            // Query municipality
            let municipality: MunicipalityDocument = null;
            try {
                municipality = await this.municipalityService.findOne({
                    name: { $regex: `^${rowCityName}$`, $options: "i" }
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
                fullName: rowName.trim(),
                address: {
                    street: rowStreet.trim(),
                    city: municipality.name,
                    zip: rowZip.trim(),
                    province: municipality.province,
                    country: municipality.country
                },
                ...(rowUsername && rowPassword ? {
                    tv: {
                        username: rowUsername.trim(),
                        email: rowEmail?.trim(),
                        password: rowPassword.trim()
                    }
                } : {}),
                // ...(rowCf ? { cf: rowCf.trim() } : {}),
                // ...(rowNotes ? { notes: rowNotes.trim() } : {}),
                // ...(rowEmail ? { email: rowEmail.trim() } : {}),
                // ...(rowPEC ? { pec: rowPEC.trim() } : {}),
                cf: rowCf?.trim(),
                notes: rowNotes?.trim(),
                email: rowEmail?.trim(),
                pec: rowPEC?.trim(),
                phoneNumber: rowPhoneNumber?.trim(),
            };

            try {
                const saved = await this.updateOne({
                    user: userId,
                    fullName: recipient.fullName,
                    "address.street": recipient.address.street,
                    "address.city": recipient.address.city,
                }, recipient, true);

                // Upsert rubric if needed
                if (rowRubric) {
                    const rubric = await this.rubricService.updateOne({
                        user: userId,
                        name: { $regex: `^${rowRubric}$`, $options: "i" }
                    }, {
                        $addToSet: { recipients: saved.id }
                    }, true, false);

                    !rubric.name && await rubric.updateOne({ $set: {
                        user: userId,
                        name: rowRubric,
                        notes: `Rubrica creata da file ${fileName ? `'${fileName}'` : "Excel"}`
                    }}).exec();
                }

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
    public async exportToXLSX(query: MongoQuery<RecipientDocument> | object = {}): Promise<Buffer> {
        logger.info(`Requested an export of recipients to XLSX.`);
        const recipients = await this.find(query);

        const workbook = utils.book_new();
        const worksheet = utils.json_to_sheet(
            await Promise.all(recipients.map(async rec => ({
                DENOMINAZIONE: rec.fullName,
                INDIRIZZO: rec.address.street,
                CAP: rec.address.zip,
                COMUNE: rec.address.city,
                PROVINCIA: rec.address.province,
                USERNAME: rec.tv?.username,
                PASSWORD: "**********",
                EMAIL: rec.tv?.email,
                "CODICE FISCALE": rec.cf,
                RUBRICA: await this.rubricService.findOne({ recipients: { $in: [ rec.id ] } })
            }))), {
            header: [ "DENOMINAZIONE", "INDIRIZZO", "CAP", "COMUNE", "PROVINCIA", "USERNAME", "PASSWORD", "EMAIL", "CODICE FISCALE", "RUBRICA" ]
        });
        worksheet["!cols"] = [
            { wch: 20 }, // DENOMINAZIONE
            { wch: 30 }, // INDIRIZZO
            { wch: 10 }, // CAP
            { wch: 20 }, // COMUNE
            { wch: 10 }, // PROVINCIA
            { wch: 20 }, // USERNAME
            { wch: 30 }, // EMAIL
            { wch: 30 }, // CODICE FISCALE
            { wch: 30 }, // RUBRICA
        ];

        utils.book_append_sheet(workbook, worksheet, "Anagrafiche");
        const buffer = write(workbook, {
            type: "buffer",
            bookType: "xlsx"
        });

        logger.info(`Ok! Export job done. I exported ${recipients.length} recipient(s).`);
        return buffer;
    }

}
