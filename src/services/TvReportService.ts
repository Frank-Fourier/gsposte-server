import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "@services/MongoRepository";
import {
    TvReport,
    TvReportAttachment,
    tvReportDecoder,
    TvReportDocument,
    TvReportModel
} from "@models/TvReportModel";
import multer, { diskStorage, MulterError } from "multer";
import { Request, Response } from "express";
import path from "path";
import { logger } from "@utils/winston";
import { generateRandomCode } from "@utils/random";
import httpErrors from "http-errors";

export const ATTACHMENTS_ROOT = process.env.ATTACHMENTS_ROOT || "public/attachments";

// Setup attachment upload middleware
const uploader = multer({
    storage: diskStorage({
        destination: (req: Request, file: Express.Multer.File, callback: (error: (Error | null), destination: string) => void) => {
            callback(null, ATTACHMENTS_ROOT);
        },
        filename(req: Request, file: Express.Multer.File, callback: (error: (Error | null), filename: string) => void): void {
            callback(null, `attachment_${generateRandomCode()}${path.extname(file.originalname)}`);
        }
    }),
    limits: {
        files: 1,
        fileSize: 100 * 1000 * 1000 // ~100MB
    },
    // The file filter will accept every file
    fileFilter(req: Request, file: Express.Multer.File, callback: (error: (Error | null), acceptFile: boolean) => void): void {
        callback(null, true);
    }
}).single("file");

@provide(TvReportService)
export class TvReportService extends MongoRepository<TvReport, TvReportDocument> {

    constructor(private tvReportModel = TvReportModel) {
        super(tvReportModel, tvReportDecoder, [ "body" ]);
    }

    /**
     * Utility method to simplify the Multer upload routine
     * Call this directly from Controller with req and res params
     *
     * @param req Request object
     * @param res Response object
     * @returns Promise resolved with file info when the upload is done.
     */
    public upload(req: Request, res: Response): Promise<TvReportAttachment> {
        return new Promise(((resolve, reject) => {
            uploader(req, res, (err: MulterError | any) => {
                // Check if a Multer specific error occured while uploading (likely file did not meet criteria)
                if (err instanceof MulterError) {
                    logger.error(`Got MulterError while uploading an attachment [${err.code}]: ${err.message}`);
                    switch (err.code) {
                        case "LIMIT_FILE_COUNT":
                            return reject(new httpErrors.BadRequest("More than one file field was passed to this upload request."));
                        case "LIMIT_FILE_SIZE":
                            return reject(new httpErrors.PayloadTooLarge("The provided file is too heavy. Only file sizes < 100MB are acceptable for upload."));
                    }
                    return reject(new httpErrors.BadRequest(`Generic error while uploading: ${err.message} [${err.code}]`));
                } else if (err) {
                    // There is an even more generic error!
                    logger.error(`Generic error while uploading an attachment: ${err}`);
                    return reject(new httpErrors.BadRequest(`Generic error while uploading: ${err}`));
                }

                if (!req.file) {
                    logger.error("A file upload request was not accepted, because file was not present.");
                    return reject(new httpErrors.NotAcceptable("No file was passed to the request."));
                }

                // Everything went fine
                logger.info(`A new attachment was uploaded at ${req.file.path}!`);
                return resolve({
                    fileName: req.file.originalname,
                    filePath: req.file.filename,
                    mimeType: req.file.mimetype,
                });
            });
        }));
    }

    /**
     * Marks as read all the reports id you pass to the array
     *
     * @param reports Array of reports id to mark as read
     * @returns {Promise<Array<TvReportDocument>>}
     */
    public async markAsRead(reports: Array<string>): Promise<Array<TvReportDocument>> {
        const updated = [];
        for (const id of reports) {
            updated.push(await this.updateById(id, { $set: { read: true }}));
        }
        return updated;
    }

}
