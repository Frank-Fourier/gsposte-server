import { provide } from "inversify-binding-decorators";
import multer, { diskStorage, MulterError } from "multer";
import { Request, Response } from "express";
import { logger } from "@utils/winston";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import httpErrors from "http-errors";

// Setup PDF upload middleware
const uploader = multer({
    storage: diskStorage({
        destination: "public/pdf/",
        // The file name is ${UUID}.pdf
        filename(req: Request, file: Express.Multer.File, callback: (error: (Error | null), filename: string) => void): void {
            callback(null, `${req.body["uuid"]}.pdf`);
        }
    }),
    limits: {
        files: 1,
        fileSize: 10 * 1000 * 1000 // 10MB
    },
    // The file filter will only accept PDF files
    fileFilter(req: Request, file: Express.Multer.File, callback: (error: (Error | null), acceptFile: boolean) => void): void {
        if (file.mimetype !== "application/pdf") {
            return callback(null, false);
        }
        callback(null, true);
    }
}).single("file");

@provide(PdfService)
export class PdfService {

    /**
     * Utility method to simplify the Multer upload routine
     * Call this directly from Controller with req and res params
     *
     * @param req Request object
     * @param res Response object
     * @returns Promise resolved when the upload is done. Throws with status code if the upload fails
     */
    public upload(req: Request, res: Response): Promise<void> {
        return new Promise(((resolve, reject) => {
            uploader(req, res, (err: MulterError | any) => {
                if (err instanceof MulterError) {
                    // A Multer specific error occured while uploading (likely file did not meet criteria)
                    logger.error(`Got MulterError while uploading a document [${err.code}]: ${err.message}`);
                    switch (err.code) {
                        case "LIMIT_FILE_COUNT":
                            return reject(new httpErrors.BadRequest("More than one file field was passed to this upload request."));
                        case "LIMIT_FILE_SIZE":
                            return reject(new httpErrors.PayloadTooLarge("The provided file is too heavy. Only file sizes < 10MB are acceptable for upload."));
                        case "LIMIT_UNEXPECTED_FILE":
                            return reject(new httpErrors.NotAcceptable("Only PDF files are acceptable for upload."));
                    }
                    return reject(new httpErrors.BadRequest(`Generic error while uploading the document: ${err.message} [${err.code}]`));
                } else if (err) {
                    // There is an even more generic error!
                    logger.error(`Got a generic error while uploading a document: ${err}`);
                    return reject(new httpErrors.BadRequest(`Generic error while uploading the document: ${err}`));
                }

                // Everything went fine
                logger.info("A new document was uploaded!");
                return resolve();
            });
        }));
    }

    /**
     * Utility method to convert a PDF file to Base64 easily
     *
     * @param pdf_path Path to file system or an URL to a PDF
     */
    public async toBase64(pdf_path: string): Promise<string> {
        if (pdf_path.startsWith("http")) {
            // The argument is an URL. Fetch it and convert
            const res = await fetch(pdf_path);
            return Buffer.from(await res.arrayBuffer()).toString("base64");
        }

        // The argument is not an URL, which means it's a path
        return Buffer.from(await fs.promises.readFile(path.resolve(pdf_path))).toString("base64");
    }

}
