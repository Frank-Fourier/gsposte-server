import { provide } from "inversify-binding-decorators";
import multer, { diskStorage, MulterError } from "multer";
import { PDFDocument, PDFName, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { Request, Response } from "express";
import { Sender, SenderDocument } from "@models/SenderModel";
import { Recipient, RecipientDocument } from "@models/RecipientModel";
import { logger } from "@utils/winston";
import { executeCommand, spawnCommand } from "@utils/command";
import { generateRandomCode } from "@utils/random";
import path from "path";
import httpErrors from "http-errors";
import fs from "fs";
import fetch from "node-fetch";
import puppeteer from "puppeteer";
import { Letter } from "@models/LetterModel";

// Setup PDF upload middleware
const uploader = multer({
    storage: diskStorage({
        destination: process.env.PDF_ROOT || "public/pdf/",
        filename(req: Request, file: Express.Multer.File, callback: (error: (Error | null), filename: string) => void): void {
            callback(null, `GS${generateRandomCode()}.pdf`);
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

export interface PDFMeta {
    subject?: string
    author?: string
    creator?: string
    producer?: string
    creationDate?: string
    updateDate?: string
    tagged?: boolean
    userProperties?: boolean
    suspects?: boolean
    form?: string
    javascript?: boolean
    pages?: number
    encrypted?: boolean
    pageSize?: string
    pageRot?: string
    fileSize?: string
    optimized?: boolean
    version?: string
}

const pdf_root = process.env.PDF_ROOT || "public/pdf/";

@provide(PdfService)
export class PdfService {

    /**
     * Utility method to simplify the Multer upload routine
     * Call this directly from Controller with req and res params
     *
     * @param req Request object
     * @param res Response object
     * @returns Promise resolved with PDF code when the upload is done. Throws with status code if the upload fails
     */
    public upload(req: Request, res: Response): Promise<string> {
        return new Promise(((resolve, reject) => {
            uploader(req, res, (err: MulterError | any) => {
                if (!req.file) {
                    logger.error("A file upload request was not accepted. Only PDF files are acceptable.");
                    return reject(new httpErrors.NotAcceptable("Only PDF files are acceptable for upload."));
                }

                // Check if a Multer specific error occured while uploading (likely file did not meet criteria)
                if (err instanceof MulterError) {
                    logger.error(`Got MulterError while uploading a PDF [${err.code}]: ${err.message}`);
                    switch (err.code) {
                        case "LIMIT_FILE_COUNT":
                            return reject(new httpErrors.BadRequest("More than one file field was passed to this upload request."));
                        case "LIMIT_FILE_SIZE":
                            return reject(new httpErrors.PayloadTooLarge("The provided file is too heavy. Only file sizes < 10MB are acceptable for upload."));
                        case "LIMIT_UNEXPECTED_FILE":
                            return reject(new httpErrors.NotAcceptable("Only PDF files are acceptable for upload."));
                    }
                    return reject(new httpErrors.BadRequest(`Generic error while uploading: ${err.message} [${err.code}]`));
                } else if (err) {
                    // There is an even more generic error!
                    logger.error(`Generic error while uploading a PDF: ${err}`);
                    return reject(new httpErrors.BadRequest(`Generic error while uploading: ${err}`));
                }

                // Everything went fine
                const code = req.file.filename.replace(".pdf", "");
                logger.info(`A new PDF was uploaded with code '${code}'.`);
                return resolve(code);
            });
        }));
    }

    /**
     * Wrapper around the postelFormat function to pass a Letter object
     *
     * @param letter to format from
     * @returns Original Base64 returned from the format function
     */
    public async formatAndSavePdf(letter: Letter): Promise<string> {
        if (process.env.NODE_ENV === "test") {
            // Skip this function entirely
            return null;
        }
        try {
            const base64 = await this.postelFormat(`${pdf_root}${letter.codePdf}.pdf`,
                letter.sender as SenderDocument,
                letter.recipients as Array<RecipientDocument>,
                letter.density
            );
            await fs.promises.writeFile(`${pdf_root}${letter.codePdf}_postel.pdf`, Buffer.from(base64, "base64"));
            return base64;
        } catch (err) {
            logger.error(`Failed to format PDF for postel! Error: ${err}`);
            throw err;
        }
    }

    /**
     * Apply Postel margins, duplicate the entire PDF for each recipient,
     * and finally write the address with the correct Postel format for each of them.
     *
     * @param pdf_path to PDF file to format
     * @param sender who will send the letter from Postel
     * @param recipients who will receive the letter from Postel
     * @param density to use while converting the PDF
     * @returns Final base64 to send with Postel API
     */
    public async postelFormat(pdf_path: string, sender: SenderDocument | Sender, recipients: Array<RecipientDocument | Recipient>, density: number): Promise<string> {
        logger.info(`Trying to format PDF for Postel from path: ${pdf_path}`);

        // There's no point if there are no recipients
        if (recipients.length === 0) {
            throw new httpErrors.BadRequest("Can't format a PDF with no recipients!");
        }

        // Get PDF buffer with margins
        const marginsPdf = await this.applyPostelMargins(pdf_path, density);

        // Courtesy of pdf-lib creator Andrew Dillon
        const clonePage = (originalPage: PDFPage) => {
            const cloneNode = originalPage.node.clone();

            const { Contents } = originalPage.node.normalizedEntries();
            if (Contents) {
                cloneNode.set(PDFName.of('Contents'), Contents.clone());
            }

            const cloneRef = originalPage.doc.context.register(cloneNode);
            return PDFPage.of(cloneNode, cloneRef, originalPage.doc);
        };
        // Quick utility method to convert px2mm with DPI
        const px = (mm: number, dpi = 72): number => Math.round((dpi * mm) / 25.4);

        const pdfDoc = await PDFDocument.create();
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const donorDoc = await PDFDocument.load(marginsPdf);
        const copies = await pdfDoc.copyPages(donorDoc, Array.from(Array(donorDoc.getPageCount()).keys()));

        let index = 0;
        for (const rec of recipients) {
            for (let p = 0; p < donorDoc.getPageCount(); ++p) {
                pdfDoc.addPage(p === 0 ? clonePage(copies[p]) : copies[p]);
            }

            const page = pdfDoc.getPages()[index];
            const { height } = page.getSize();

            // Draw info about the sender
            page.drawText(
                `${sender.name.toUpperCase()}\n` +
                (sender.address.secondary ? `${sender.address.secondary.toUpperCase()}\n` : "") +
                `${sender.address.street.toUpperCase()}\n` +
                `${sender.address.zip} ${sender.address.city.toUpperCase()} ${sender.address.province.toUpperCase()}`,
                {
                    x: px(10) + 5,
                    y: height - px(18.5),
                    font: helvetica,
                    size: 10,
                    lineHeight: 15
                });

            // Draw info about the recipient
            page.drawText(
            `${rec.fullName.toUpperCase()}\n` +
                (rec.address.secondary ? `${rec.address.secondary.toUpperCase()}\n` : "") +
                `${rec.address.street.toUpperCase()}\n` +
                `${rec.address.zip} ${rec.address.city.toUpperCase()} ${rec.address.province.toUpperCase()}`,
            {
                x: px(114) + 5,
                y: height - px(68.5),
                font: helvetica,
                size: 10,
                lineHeight: 15
            });

            if (process.env.NODE_ENV !== "production") {
                // Debug bounding boxes
                this.drawPostelBoxes(page, px);
            }

            index += donorDoc.getPageCount();
        }

        // Set final metadata and return as base64
        pdfDoc.setAuthor("GSPoste");
        pdfDoc.setCreator("GSPoste");
        pdfDoc.setSubject("GSPoste");
        pdfDoc.setLanguage("it-IT");
        pdfDoc.setKeywords([]);
        pdfDoc.setCreationDate(new Date());
        pdfDoc.setModificationDate(new Date());

        logger.info(`Formatted PDF for Postel from path: ${pdf_path}.`);
        return await pdfDoc.saveAsBase64();
    }

    /**
     * Apply the standard Postel margins to a PDF. Those margins are:
     * - 1st page: 10mm LEFT, 10mm RIGHT, 10mm BOTTOM, 96mm TOP
     * - Other pages: 10mm LEFT, 10mm RIGHT, 10mm BOTTOM, 2mm TOP
     *
     * @param pdf_path
     * @param density to use while converting (150 or 300 is preferred)
     * @returns Buffer containing the PDF with margins applied
     */
    private async applyPostelMargins(pdf_path: string, density: number): Promise<Buffer> {
        // Get the pages as images from the PDF file
        const images = await this.convertPagesToImages(pdf_path, density);

        // Create the HTML with margins applied and page images
        const html = `
            <html>
                <head>
                    <style>
                        .first-page { margin: 96mm 10mm 10mm; }
                        .page { margin: 2mm 10mm 10mm; }
                        img { width: 100%; }
                    </style>
                </head>
                <body>
                    ${images.map((img, index) => `<div class=${index === 0 ? "first-page" : "page"}><img src=${img} alt="Page #${index + 1}"/></div>`).join("")}
                </body>
            </html>
        `.trim();

        try {
            // Use Puppeteer to create a new PDF from this HTML file
            const browser = await puppeteer.launch({
                headless: true,
                // On Docker I need to disable the usage of /dev/shm to store shared memory
                // Otherwise it will just crash on launch...
                args: process.env.NODE_ENV === "production" ? ['--disable-dev-shm-usage'] : [],
                // On Docker I need to specify that I want to use my own Chromium
                executablePath: process.env.NODE_ENV === "production" ? "/usr/bin/chromium-browser" : undefined
            });
            const page = await browser.newPage();
            await page.setContent(html, {
                // Consider navigation to be finished when the DOMContentLoaded event is fired
                waitUntil: "domcontentloaded"
            });

            const pdf = await page.pdf({ format: "A4" });
            await browser.close();

            return pdf;
        } catch (err) {
            logger.error(`Error while creating new PDF file with Puppeteer from margins HTML.`, err);
            throw new httpErrors.InternalServerError(`Error while creating new PDF file with Puppeteer from margins HTML. ${err}`);
        }
    }

    /**
     * Conver each PDF page to a base64 image and returns an array containing the data.
     * Requires 'imagemagick' to be installed on the system.
     *
     * @param pdf_path
     * @param density
     * @returns array containing the pages as base64
     */
    private async convertPagesToImages(pdf_path: string, density: number): Promise<string[]> {
        try {
            // Get number of pages from PDF metadata
            const pages = (await this.metadata(pdf_path)).pages;
            const images: string[] = []; // Base64 array

            // Execute the convert command for each page
            for (let page = 0; page < pages; ++page) {
                const base64 = await spawnCommand(`convert`,
                    "-quality", "90", "-density", density.toString(), "-flatten", "-trim", `${pdf_path}[${page}]`, "-quiet", "INLINE:JPG:",
                );
                images.push(base64);
            }

            return images;
        } catch (err) {
            logger.error(`Error while converting PDF pages to images.`, { error: err.error });
            throw new httpErrors.InternalServerError(`Error while converting PDF pages to images.`);
        }
    }

    /**
     * Convert a PDF file to Base64.
     *
     * @param pdf_path Path to file system or an URL to a PDF
     */
    public async toBase64(pdf_path: string): Promise<string> {
        try {
            if (pdf_path.startsWith("http")) {
                // The argument is an URL. Fetch it and convert
                const res = await fetch(pdf_path);
                return Buffer.from(await res.arrayBuffer()).toString("base64");
            }

            // The argument is not an URL, which means it's a path
            return Buffer.from(await fs.promises.readFile(path.resolve(pdf_path))).toString("base64");
        } catch (err) {
            logger.error(`Error while converting PDF from '${pdf_path}' to base64.`, err);
            throw new httpErrors.InternalServerError(`Failed to convert PDF from '${pdf_path}' to base64. Error: ${err || 'unknown'}`);
        }
    }

    /**
     * Returns metadata about a PDF file.
     * Requires 'poppler-utils' to be installed on the system.
     * Throws with stderr info on failure.
     *
     * @param pdf_path
     */
    public async metadata(pdf_path: string): Promise<PDFMeta> {
        const stdout = await executeCommand(`pdfinfo ${pdf_path}`);
        const info: any = {};
        stdout.split("\n").forEach((line) => {
            if (line.match(/^(.*?):[ \t]*(.*)$/)) {
                info[RegExp.$1] = RegExp.$2;
            }
        });
        return {
            subject: info["Subject"],
            author: info["Author"],
            creator: info["Creator"],
            producer: info["Producer"],
            creationDate: info["CreationDate"],
            updateDate: info["ModDate"],
            tagged: info["Tagged"] === "yes",
            userProperties: info["UserProperties"] === "yes",
            suspects: info["Suspects"] === "yes",
            form: info["Form"],
            javascript: info["JavaScript"] === "yes",
            pages: info["Pages"] ? parseInt(info["Pages"]) : undefined,
            encrypted: info["Encrypted"] === "yes",
            pageSize: info["Page size"],
            pageRot: info["Page rot"],
            fileSize: info["File size"],
            optimized: info["Optimized"] === "yes",
            version: info["PDF version"],
        }
    }

    private drawPostelBoxes(page: PDFPage, px: (mm: number) => number) {
        const height = page.getHeight();

        // Area finestra mittente
        page.drawRectangle({
            x: px(10),
            y: height - px(14.01),
            width: px(90),
            height: -px(22),
            borderColor: rgb(0, 1, 0),
        });

        // Area finestra destinatario
        page.drawRectangle({
            x: px(85),
            y: height - px(44),
            width: px(115),
            height: -px(52),
            borderColor: rgb(0, 0, 1),
        });

        // Area visibilità indirizzo destinatario
        page.drawRectangle({
            x: px(114),
            y: height - px(63),
            width: px(86),
            height: -px(24),
            borderColor: rgb(0, 1, 0),
        });

        // Aree riservate
        page.drawRectangle({
            x: px(100),
            y: height - px(44),
            width: px(43),
            height: -px(19),
            borderColor: rgb(1, 0, 0),
        });
        page.drawRectangle({
            x: px(160),
            y: height - px(44),
            width: px(40),
            height: -px(19),
            borderColor: rgb(1, 0, 0),
        });

        // Area finestra raccomandata
        page.drawRectangle({
            x: px(10),
            y: height - px(55),
            width: px(75),
            height: -px(30),
            borderColor: rgb(0, 0, 1),
        });
    }

}
