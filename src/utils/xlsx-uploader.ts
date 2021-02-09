import multer, { diskStorage, MulterError } from "multer";
import { Request, Response } from "express";
import { logger } from "@utils/winston";
import httpErrors from "http-errors";
import { Document } from "mongoose";

export type CellValidator = (value: string, ...params: any[]) => { valid: boolean, error: string };
export interface ImportResponse<T extends Document> {
    imported: Array<T>
    errors: Array<{ row: number, description: string, data?: any }>
}

// Setup XLSX upload middleware
export const xlsxUploader = multer({
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

/**
 * Utility method to simplify the Multer upload routine
 * Call this directly from Controller with req and res params
 *
 * @param req {Request} Express Request object
 * @param res {Response} Express Response object
 * @returns Promise resolved with XLSX file name when the upload is done. Throws with status code if the upload fails
 */
export function uploadXLSX(req: Request, res: Response): Promise<string> {
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
