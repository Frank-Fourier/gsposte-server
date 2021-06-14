import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "@services/MongoRepository";
import { Sender, senderDecoder, SenderDocument, SenderModel } from "@models/SenderModel";
import { CellValidator, ImportError, ImportResponse, validators } from "@utils/xlsx-uploader";
import { logger } from "@utils/winston";
import { read, utils, WorkBook } from "xlsx";
import httpErrors from "http-errors";
import { inject } from "inversify";
import { MunicipalityService } from "@services/MunicipalityService";

interface SenderXLSX {
    // SEGUE FORMATO DANEA RISTRETTO
    Denominazione?: string
    Indirizzo?: string
    Cap?: string
    Città?: string
    "Codice fiscale"?: string

    // SEGUE FORMATO DANEA ESTESO
    Tipo?: string
    Nome?: string
    CodFiscale?: string
    CAP?: string
    Provincia?: string
    Banca?: string
    IBAN?: string
    SWIFT?: string
    "Dati catastali"?: string
}

/**
 * @swagger
 *
 * definitions:
 *   SendersImportResponse:
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
export type SendersImportResponse = ImportResponse<SenderDocument>

@provide(SenderService)
export class SenderService extends MongoRepository<Sender, SenderDocument> {

    @inject(MunicipalityService) private municipalityService: MunicipalityService;

    constructor(private senderModel = SenderModel) {
        super(senderModel, senderDecoder, [
            "name", "description", "address.street", "address.secondary", "address.city",
            "address.zip", "address.province", "address.country", "iva", "cf", "email", "notes"
        ]);
    }

    public async save(sender: Sender): Promise<SenderDocument> {
        const dup = await this.find({
            user: sender.user,
            name: sender.name,
        });
        if (dup.length > 0) {
            throw new httpErrors.Conflict("Senders must be unique on a user basis.");
        }

        return super.save(sender);
    }

    /**
     * Import a set of senders from an XLSX file
     *
     * @param xlsx {Buffer} Entire XLSX document
     * @param userId {string} Owner of the imported senders
     * @returns {Promise<{ imported: Array<SenderDocument>, errors: Array<ImportError> } Promise resolved when the whole document is traversed and senders are imported. Contains all the errors that occured during the process.
     */
    public async importFromXLSX(xlsx: Buffer, userId: string): Promise<SendersImportResponse> {
        logger.info(`Requested an import of senders from XLSX.`);

        const imported: Array<SenderDocument> = [];
        const errors: Array<ImportError> = [];

        const wb: WorkBook = read(xlsx, { type: "buffer" });
        const sheet = Object.values(wb.Sheets).filter(s => !!s)[0];
        if (!sheet) {
            throw new httpErrors.BadRequest("The XLSX file does not have any valid sheet to read data from.");
        }

        const sheetJson = utils.sheet_to_json(sheet);
        for (let row = 0; row < sheetJson.length; ++row) {
            const data: SenderXLSX = sheetJson[row] as SenderXLSX;
            const cellValue = (columnName: keyof SenderXLSX) =>
                data[columnName] ? String(data[columnName]).trim() : null;

            const rowName     = cellValue("Denominazione") || cellValue("Nome"),
                  rowCf       = cellValue("Codice fiscale") || cellValue("CodFiscale"),
                  rowStreet   = cellValue("Indirizzo"),
                  rowZip      = cellValue("Cap") || cellValue("CAP"),
                  rowCityName = cellValue("Città"),
                  rowBank     = cellValue("Banca"),
                  rowIBAN     = cellValue("IBAN"),
                  rowSWIFT    = cellValue("SWIFT"),
                  rowInfo     = cellValue("Dati catastali");

            const validateCell = (val: string, validators: CellValidator[]) =>
                validators.filter(v => !v(val).valid).map(nv => {
                    errors.push({ row: row + 2, description: nv(val).error });
                    return nv;
                }).length === 0;

            if (!validateCell(rowName, [ validators.notEmpty("Denominazione"), validators.maxLength("Denominazione", 44) ])) continue;
            if (!validateCell(rowStreet, [ validators.notEmpty("Indirizzo"), validators.maxLength("Indirizzo", 44) ])) continue;
            if (!validateCell(rowZip, [ validators.notEmpty("CAP"), validators.maxLength("CAP", 5) ])) continue;
            if (!validateCell(rowCityName, [ validators.notEmpty("Città"), validators.maxLength("Città", 44) ])) continue;
            if (!validateCell(rowCf, [ validators.maxLength("Codice Fiscale", 16) ])) continue;
            if (!validateCell(rowBank, [ validators.maxLength("Banca", 100) ])) continue;
            if (!validateCell(rowIBAN, [ validators.maxLength("IBAN", 100) ])) continue;
            if (!validateCell(rowSWIFT, [ validators.maxLength("SWIFT", 100) ])) continue;
            if (!validateCell(rowInfo, [ validators.maxLength("Dati catastali", 500) ])) continue;

            const municipality = await this.municipalityService.assertMunicipalityExists(rowCityName, rowZip, row, errors);
            if (!municipality) {
                continue;
            }

            // Create the new sender to import
            const sender: Sender = {
                user: userId,
                name: rowName,
                description: rowName,
                businessName: rowName,
                address: {
                    street: rowStreet.trim(),
                    city: municipality.name,
                    zip: rowZip.trim(),
                    province: municipality.province,
                    country: municipality.country
                },
                invoiceCode: "0000000",
                iva: rowCf,
                bank: rowBank,
                iban: rowIBAN,
                swift: rowSWIFT,
                info: rowInfo,
            };

            try {
                const saved = await this.updateOne({
                    user: userId,
                    name: sender.name,
                }, sender, true);

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

                logger.error(`Got an error while saving a new imported sender on row ${row + 2}!`, err);
                errors.push({
                    row: row + 2,
                    description: `Non è stato possibile salvare il nuovo mittente nel sistema.`,
                    data: err.message || err
                });
            }
        }

        logger.info(`Ok! Import job done. I imported ${imported.length} sender(s), got ${errors.length} error(s). Errors: `, errors);
        return { imported, errors };
    }

}
