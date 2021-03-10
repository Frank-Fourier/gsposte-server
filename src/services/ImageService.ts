import { provide } from "inversify-binding-decorators";
import multer, { diskStorage, MulterError } from "multer";
import { Request, Response } from "express";
import { generateRandomCode } from "@utils/random";
import { logger } from "@utils/winston";
import fs from "fs";
import httpErrors from "http-errors";

export const IMAGES_ROOT = process.env.IMAGES_ROOT || "public/images";

const uploader = multer({
    storage: diskStorage({
        destination: (req: Request, file: Express.Multer.File, callback: (error: (Error | null), destination: string) => void) => {
            fs.mkdir(IMAGES_ROOT, () => callback(null, IMAGES_ROOT));
        },
        filename(req: Request, file: Express.Multer.File, callback: (error: (Error | null), filename: string) => void): void {
            let extArray = file.mimetype.split("/");
            let extension = extArray[extArray.length - 1];
            callback(null, `IMG_${generateRandomCode()}.${extension}`);
        }
    }),
    limits: {
        files: 1,
        fileSize: 100 * 1000 * 1000 // ~100MB
    },
    // The file filter will only accept image files
    fileFilter(req: Request, file: Express.Multer.File, callback: (error: (Error | null), acceptFile: boolean) => void): void {
        if (![ "image/jpeg", "image/png" ].includes(file.mimetype)) {
            return callback(null, false);
        }
        callback(null, true);
    }
}).single("file");

@provide(ImageService)
export class ImageService {

    async upload(req: Request, res: Response): Promise<{ filename: string }> {
        return new Promise((resolve, reject) => {
            uploader(req, res, (err: MulterError | any) => {
                // Check if a Multer specific error occured while uploading (likely file did not meet criteria)
                if (err instanceof MulterError) {
                    logger.error(`Got MulterError while uploading a accepted file [${err.code}]: ${err.message}`);
                    switch (err.code) {
                        case "LIMIT_FILE_COUNT":
                            return reject(new httpErrors.BadRequest("More than one file field was passed to this upload request."));
                        case "LIMIT_FILE_SIZE":
                            return reject(new httpErrors.PayloadTooLarge("The provided file is too heavy. Only file sizes < 100MB are acceptable for upload."));
                        case "LIMIT_UNEXPECTED_FILE":
                            return reject(new httpErrors.NotAcceptable("Only image files are acceptable for upload."));
                    }
                    return reject(new httpErrors.BadRequest(`Generic error while uploading: ${err.message} [${err.code}]`));
                } else if (err) {
                    // There is an even more generic error!
                    logger.error(`Generic error while uploading an image: ${err}`);
                    return reject(new httpErrors.BadRequest(`Generic error while uploading: ${err}`));
                }

                if (!req.file) {
                    logger.error("A file upload request was not accepted, because file was not present. Only image files are acceptable.");
                    return reject(new httpErrors.NotAcceptable("No file was passed to the request. Only image files are acceptable for upload."));
                }

                // Everything went fine
                return resolve({
                    filename: req.file.filename
                });
            });
        });
    }

}
