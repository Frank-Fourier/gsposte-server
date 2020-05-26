import { provide } from "inversify-binding-decorators";
import { MongoQuery, MongoRepository } from "@services/MongoRepository";
import { TvUser, tvUserDecoder, TvUserDocument, TvUserModel } from "@models/tv/TvUserModel";
import { Request, Response } from "express";
import { CellValidator, ImportResponse, uploadXLSX } from "@utils/xlsx-uploader";
import { logger } from "@utils/winston";
import { read, utils, WorkBook, write } from "xlsx";
import httpErrors from "http-errors";

/**
 * @swagger
 *
 * definitions:
 *   TvUsersImportResponse:
 *     type: object
 *     properties:
 *       imported:
 *         type: array
 *         items:
 *           $ref: "#/definitions/TvUserDocument"
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
export type TvUsersImportResponse = ImportResponse<TvUserDocument>

@provide(TvUserService)
export class TvUserService extends MongoRepository<TvUser, TvUserDocument> {

    constructor(private tvUserModel = TvUserModel) {
        super(tvUserModel, tvUserDecoder, [
            "username", "email"
        ]);
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
     * Import a set of TV users from an XLSX file
     *
     * @param xlsx {Buffer} Entire XLSX document
     * @param userId {string} Owner of the imported TV users
     * @returns {Promise<TvUsersImportResponse> } Promise resolved when the whole document is traversed and contacts are imported. Contains all the errors that occured during the process.
     */
    public async importFromXLSX(xlsx: Buffer, userId: string): Promise<TvUsersImportResponse> {
        logger.info(`Requested an import of TV users from XLSX.`);

        const imported: Array<TvUserDocument> = [];
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

            // USERNAME, EMAIL, PASSWORD
            const rowUsername = cellValue(0),
                rowEmail      = cellValue(1),
                rowPassword   = cellValue(2);

            const validateCell = (val: string, validators: CellValidator[]) =>
                validators.filter(v => !v(val).valid).map(nv => {
                    errors.push({ row: row + 2, description: nv(val).error });
                    return nv;
                }).length === 0;

            if (!validateCell(rowUsername, [ validators.notEmpty("Username"), validators.maxLength("Username", 40) ])) continue;
            if (!validateCell(rowEmail, [ validators.maxLength("Email", 40) ])) continue;
            if (!validateCell(rowPassword, [ validators.notEmpty("Password") ])) continue;

            // Create the new TV user to import
            const tvUser: TvUser = {
                user: userId,
                username: rowUsername,
                email: rowEmail,
                password: rowPassword,
            };

            try {
                const saved = await this.save(tvUser);
                imported.push(saved);
            } catch (err) {
                if (err.status === 409) {
                    // This is a duplicate for this user. Skip it
                    errors.push({
                        row: row + 2,
                        description: `Condomino duplicato!`
                    });
                    continue;
                }

                logger.error(`Got an error while saving a new imported TV user on row ${row + 2}!`, err);
                errors.push({
                    row: row + 2,
                    description: `Non è stato possibile salvare il nuovo condomino nel sistema.`,
                    data: err.message || err
                });
            }
        }

        logger.info(`Ok! Import job done. I imported ${imported.length} TV user(s), got ${errors.length} error(s). Errors: `, errors);
        return { imported, errors };
    }

    /**
     * Export a set of TV users to an XLSX file
     *
     * @param query {MongoQuery<TvUserDocument>} Filter TV users to export
     * @returns {Promise<Buffer>} Promise resolving to exported XLSX file as buffer
     */
    public async exportToXLSX(query: MongoQuery<TvUserDocument> | object): Promise<Buffer> {
        logger.info(`Requested an export of TV users to XLSX.`);
        const tvUsers = await this.find(query);

        const workbook = utils.book_new();
        const worksheet = utils.json_to_sheet(tvUsers.map(u => ({
            USERNAME: u.username,
            EMAIL: u.email,
            PASSWORD: u.password,
        })), {
            header: [ "USERNAME", "EMAIL", "PASSWORD" ]
        });
        worksheet["!cols"] = [ { wch: 20 }, { wch: 30 }, { wch: 30 } ];

        utils.book_append_sheet(workbook, worksheet, "Condomini");
        const buffer = write(workbook, {
            type: "buffer",
            bookType: "xlsx"
        });

        logger.info(`Ok! Export job done. I exported ${tvUsers.length} TV user(s).`);
        return buffer;
    }

}
