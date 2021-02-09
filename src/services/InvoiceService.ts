import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PDF_ROOT, PdfService } from "@services/PdfService";
import { LetterDocument } from "@models/LetterModel";
import { SenderDocument } from "@models/SenderModel";
import { Invoice, invoiceDecoder, InvoiceDocument, InvoiceModel } from "@models/InvoiceModel";
import { PriceService } from "@services/PriceService";
import { LetterService } from "@services/LetterService";
import { UserService } from "@services/UserService";
import { compileFile } from "pug";
import { Document } from "mongoose";
import { MongoRepository } from "@services/MongoRepository";
import { BadRequest, Forbidden, InternalServerError } from "http-errors";
import { logger } from "@utils/winston";
import { formatCurrency, groupBy, insert } from "@utils/misc";
import { FICService } from "@services/FICService";
import { FIC } from "@models/fattureincloud/Documenti";
import moment from "moment";
import fs from "fs";
import { sleep } from "@utils/sleep";
import { UserDocument } from "@models/UserModel";
import { ws_message } from "@utils/websockets";
import { NoticeKind } from "@models/NoticeModel";
import { NoticeService } from "@services/NoticeService";

export const INVOICES_ROOT = process.env.INVOICES_ROOT || "public/invoices";
export interface InvoiceBulkExportResponse {
    exported: Array<InvoiceDocument>
    errors: Array<{ invoice: InvoiceDocument, error: any }>
}
export interface ExportFlags {
    exporting: boolean
    exported: number
    to_export: number
    progress: number
}

@provide(InvoiceService)
export class InvoiceService extends MongoRepository<Invoice, InvoiceDocument> {

    @inject(PdfService) private pdf: PdfService;
    @inject(PriceService) private priceService: PriceService;
    @inject(UserService) private userService: UserService;
    @inject(LetterService) private letterService: LetterService;
    @inject(FICService) private fic: FICService;
    @inject(NoticeService) private noticeService: NoticeService;

    private exportFlags: ExportFlags = {
        exporting: false,
        exported: 0,
        to_export: 0,
        progress: 0,
    }

    constructor(private invoiceModel = InvoiceModel) {
        super(invoiceModel, invoiceDecoder, [ "number" ]);
    }

    public async deleteById(id: string): Promise<InvoiceDocument> {
        const invoice = await this.findById(id, { populate: "letters" });
        for (const letter of invoice.letters as Array<LetterDocument>) {
            await letter.updateOne({ $unset: { invoice: "" } });
        }
        return super.deleteById(id);
    }

    /**
     * Generate an invoice for a set of letters. The letters array must not be empty,
     * and all the letters must have the same sender.
     *
     * @param letters {Array<LetterDocument>} Letters to generate an invoice from
     * @param number {number} Invoice number
     * @returns Promise resolving to the invoice created and any errors that occured during the process
     */
    public async generateSingleInvoice(letters: Array<LetterDocument>, number: number): Promise<{
        invoice: InvoiceDocument,
        errors: Array<{ letter: LetterDocument, error: Error | any }>
    }> {
        if (letters.length === 0) {
            throw new BadRequest("Letters array is empty! Can't generate invoice.");
        }

        const errors: Array<{ letter: LetterDocument, error: Error | any }> = [];
        let taxableSum = 0;

        for (const letter of letters) {
            letter.depopulate("sender user");
            if (letter.sender.toString() !== letters[0].sender.toString()) {
                throw new BadRequest("Letters to generate an invoice from must all have the same sender!");
            }

            try {
                if (!letter.sent) {
                    throw new BadRequest("This letter is not sent so I won't include it in the invoice.");
                }
                if (letter.error) {
                    throw new BadRequest("This letter is in an error state so I won't include it in the invoice.");
                }

                const taxable = (letter.price || await this.priceService.calculatePrice(letter)) * letter.recipients.length;
                if (taxable <= 0 || isNaN(taxable)) {
                    throw new BadRequest("Can't create an invoice for a letter without a price!");
                }

                taxableSum += taxable;
            } catch (err) {
                errors.push({ letter: letter, error: err });
            }
        }

        const iva = (taxableSum * 22) / 100;
        const total = taxableSum + iva;
        const invoice = await this.save({
            user: letters[0].user,
            sender: letters[0].sender,
            letters: letters.filter(l => l.sent),
            taxable: parseFloat(taxableSum.toFixed(2)),
            iva: parseFloat(iva.toFixed(2)),
            total: parseFloat(total.toFixed(2)),
        });

        if (!!number) {
            await invoice.updateOne({ $set: { number: number } }).exec();
            invoice.number = number;
        }

        for (const letter of letters) {
            await letter.updateOne({ $set: { invoice: invoice.id }}).exec();
        }

        return {
            invoice: invoice,
            errors: errors
        };
    }

    /**
     * Generate N invoices for a user, aggregating the letters not yet paid with the same senders.
     * Basically performs the aggregation and then calls the generateSingleInvoice function for each array.
     *
     * @param user {string} User id to search letters for
     * @param startNumber {number} Invoice number to start generation from
     * @returns Array of results of generateSingleInvoice, one for each letter
     */
    public async generateInvoicesForUser(user: string, startNumber?: number): Promise<Array<{
        invoice: InvoiceDocument,
        errors: Array<{ letter: LetterDocument, error: Error | any }>
    }>> {
        const letters = await this.letterService.find({
            user: user,
            sent: true,
            paid: false,
            error: { $ne: true },
            invoice: { $exists: false },
        });
        if (!letters || letters.length === 0) {
            return [];
        }

        const aggregated = groupBy<LetterDocument>(letters, letter => letter.sender as string);
        const results: Array<{
            invoice: InvoiceDocument,
            errors: Array<{ letter: LetterDocument, error: Error | any }>
        }> = [];

        let lastNumber = startNumber || await this.getLatestInvoiceNumber();
        for (const letter of Object.values(aggregated)) {
            const invoice = await this.generateSingleInvoice(letter, lastNumber + 1);
            results.push(invoice);
            lastNumber++;
        }

        return results;
    }

    /**
     * The most generic flavor of generateSingleInvoice, generates all the possible invoices, for every single user!
     *
     * @param startNumber {number} Optional invoice number to start from
     * @returns Key-value where each key is the user id, and each value is the array of results
     */
    public async generateInvoices(startNumber?: number): Promise<{
        [key: string]: Array<{
            invoice: InvoiceDocument,
            errors: Array<{ letter: LetterDocument, error: Error | any }>
        }>
    }> {
        const users = await this.userService.findAll();
        const results: {
            [key: string]: Array<{
                invoice: InvoiceDocument,
                errors: Array<{ letter: LetterDocument, error: Error | any }>
            }>
        } = {};

        for (const user of users) {
            const res = await this.generateInvoicesForUser(user.id, startNumber);
            startNumber += res.length;
            if (res.length > 0) {
                results[user.id] = res;
            }
        }

        return results;
    }

    /**
     * Fetchs the latest invoice number from the latest created invoice in the database
     *
     * @returns {Promise<number>} Promise resolving to the latest invoice number
     */
    public async getLatestInvoiceNumber(): Promise<number> {
        // Filter invoices of this current year
        const year = new Date().getFullYear();
        const invoices = (await this.find({
            createdAt: {
                $gte: `${year}-01-01`,
                $lte: `${year}-12-31`
            }
        }, { sort: { "createdAt": -1 } }));
        if (!invoices || invoices.length === 0) {
            return 0;
        }

        return invoices[0].number;
    }

    /**
     * Toggle an invoice paid property. This means that its 'paid' property becomes true, as well as all the
     * 'paid' properties of the letters associated with this invoice. The viceversa is also true: if paid was true,
     * it will become false.
     *
     * @param invoice {InvoiceDocument} Invoice to toggle paid
     * @returns {Promise<InvoiceDocument>} Promise resolving to the updated invoice document
     */
    public async toggleInvoicePaid(invoice: InvoiceDocument): Promise<InvoiceDocument> {
        invoice = await invoice.populate("letters").execPopulate();
        await Promise.all(
            invoice.letters.map((letter: LetterDocument) =>
                this.letterService.updateById((letter as LetterDocument).id, {
                    $set: { paid: !letter.paid }
                })
            )
        );
        return this.updateById(invoice.id, {
            $set: { paid: !invoice.paid, paymentDate: Date.now() }
        });
    }

    /**
     * Generates an invoice for a letter. You can't generate an invoice for letters that are not yet sent!
     * Please note that this does not generate a real invoice, rather a note for a single letter, a "distinta"
     *
     * @param letter {LetterDocument} Letter to generate invoice from
     * @param root {string} Optional path root
     * @returns {Promise<Buffer>} Promise resolvingu to the PDF file path
     */
    public async generateLetterInvoicePDF(letter: LetterDocument, root?: string): Promise<string> {
        if (!letter.sent) {
            throw new Forbidden("You are not allowed to create an invoice for a letter that was not sent!");
        }
        if (letter.error) {
            throw new Forbidden("You are not allowed to create an invoice for an errored letter!");
        }
        if (!letter.posteway) {
            throw new BadRequest("The letter has no 'posteway' field, so I can't generate an invoice.");
        }

        // Avoid generating PDF again if it's already there
        const path = `${root ? root : `${PDF_ROOT}/${letter.codePdf}`}/invoice.pdf`;
        if (fs.existsSync(path)) {
            return path;
        }

        await letter.populate("sender recipients").execPopulate();
        const price = letter.price || await this.priceService.calculatePrice(letter);

        try {
            // Call PosteWay to get the latest info
            letter = await this.letterService.queryLetter(letter);
        } catch (err) {
            logger.warn(`[INVOICE ${letter.codePdf}] Failed to query letter on PosteWay!`, err);
        }

        // Format envelopes dates
        letter.posteway.track.recipients = letter.posteway.track.recipients?.map(r => ({
            ...r,
            person: {
                ...r.person,
                fullName: `${r.person.name?.toUpperCase() ?? (r.person.businessName?.toUpperCase() ?? "")} ${r.person.surname?.toUpperCase() ?? ""}`,
            },
            ...insert(!!r.tracking, {
                tracking: {
                    ...r.tracking,
                    date: r.tracking.date ? moment(r.tracking.date, "DD/MM/YYYY hh:mm:ss").format("DD/MM/YYYY") : null
                }
            })
        }));

        const html = compileFile(`${process.env.VIEWS_ROOT}/invoice.pug`)({
            sender: letter.sender ? (letter.sender as SenderDocument).toObject() : {},
            posteway: (letter.posteway as Partial<Document>).toObject() || {},
            dateSent: letter.sendAt ? moment(letter.sendAt).format("DD/MM/YYYY") : null,
            partial: false,
            codePdf: letter.codePdf,
            kind: letter.kind,
            price: formatCurrency(price),
            total: formatCurrency(price * letter.posteway.track.recipients.length),
        });

        // I wait until networkidle2 to let all the images on the HTML load before converting
        const pdf = await this.pdf.htmlToPdf(html, "networkidle2");
        await fs.promises.writeFile(path, pdf);
        return path;
    }

    /**
     * Generates a PDF representing the invoice.
     *
     * @param invoice {InvoiceDocument} Invoice to generate PDF from
     * @returns {Promise<Buffer>} Promise resolving to the PDF file as Buffer
     */
    public async generateInvoicePDF(invoice: InvoiceDocument): Promise<Buffer> {
        await invoice.populate("sender letters").execPopulate();
        const createdAt = moment(invoice.toObject()["createdAt"]);

        const html = compileFile(`${process.env.VIEWS_ROOT}/letters_invoice.pug`)({
            sender: (invoice.sender as SenderDocument).toObject(),
            number: `${invoice.number}/${createdAt.year()}`,
            createdAt: createdAt.format("DD/MM/YYYY"),
            services: invoice.letters.map((letter: LetterDocument) => ({
                name: `${letter.kind} Online`,
                description: letter.subject,
                quantity: letter.recipients.length,
                priceSingle: formatCurrency(letter.price),
                total: formatCurrency(letter.price * letter.recipients.length),
            })),
            taxable: formatCurrency(invoice.taxable),
            iva: formatCurrency(invoice.iva),
            total: formatCurrency(invoice.total)
        });

        // I wait until networkidle2 to let all the images on the HTML load before converting
        return this.pdf.htmlToPdf(html, "networkidle2");
    }

    /**
     * Exports an invoice to Fatture in Cloud account.
     * Requires credentials to be defined in process environment, populates FIC field on success.
     * Throws if external FIC API call fails.
     *
     * @param exporter {UserDocument} Who is exporting this invoice (must be an admin)
     * @param invoice {InvoiceDocument} Invoice to export
     * @returns {Promise<InvoiceDocument>} Promise resolving to the same invoice with FIC field
     */
    public async exportToFIC(exporter: UserDocument, invoice: InvoiceDocument): Promise<InvoiceDocument> {
        if (!exporter.isAdmin()) {
            throw new Forbidden("You can't export documents to FIC!");
        }

        if (!!invoice.fic) {
            // Already exported
            return invoice;
        }

        const result = await this.fic.documenti.fatture.nuovo(
            await FIC.mapInvoiceToFattura(invoice)
        );
        if (!(result as FIC.NuovoDocumentoResponse).success) {
            const err = result as FIC.Error;
            throw new InternalServerError(`Errore Fatture in Cloud [${err.error_code}]: ${err.error}`);
        }

        const response = result as FIC.NuovoDocumentoResponse;
        invoice.fic = {
            id: response.new_id,
            token: response.token,
        };
        return invoice.save();
    }

    /**
     * Finds all invoices that do not have a FIC field and exports them to FIC by calling exportToFIC().
     * Returns an object containing what was exported and what wasn't due to an error.
     * Since FIC has a shitty hourly quota, this method will take a long ass time to execute, due to sleeps.
     * Progress will be pushed to the WebSockets channel.
     *
     * @param exporter {UserDocument} Who is exporting these invoices (must be an admin)
     * @param wait {boolean} True if you want to sleep 7.5 secs between each request
     * @returns {Promise<void>} Resolves after starting the process because the export process is async
     */
    public async bulkExportToFIC(exporter: UserDocument, wait = true): Promise<void> {
        if (!exporter.isAdmin()) {
            throw new Forbidden("You can't export documents to FIC!");
        }
        if (this.exportFlags.exporting) {
            throw new BadRequest("A export is already in progress.");
        }

        const toExport = await this.find({
            fic: { $exists: false }
        });

        logger.info(`STARTED BULK EXPORT TO FATTURE IN CLOUD OF ${toExport.length} INVOICES!`);
        const response: InvoiceBulkExportResponse = { exported: [], errors: [] };
        this.exportFlags.exporting = true;

        // Fatture in Cloud maximum quota is:
        // 30 requests per minute
        // 500 requests per hour
        // So sleeping 7.5 seconds should keep us under the quota
        (async () => {
            for (const invoice of toExport) {
                try {
                    const exported = await this.exportToFIC(exporter, invoice);
                    this.exportFlags = {
                        exporting: true,
                        exported: response.exported.length,
                        to_export: toExport.length,
                        progress: parseFloat(((response.exported.length / toExport.length) * 100).toFixed(2)),
                    }

                    response.exported.push(exported);
                    ws_message(exported.id, {
                        kind: NoticeKind.FIC_EXPORT,
                        error: false,
                        data: this.exportFlags
                    });

                    wait && await sleep(7500);
                } catch (err) {
                    const e = err as FIC.Error;
                    response.errors.push(err);
                    this.noticeService.save({
                        user: exporter.id,
                        title: "Fattura non esportata",
                        content: `Non è stato possibile esportare la fattura nr.${invoice.number}/${moment(invoice.createdAt).year()} a causa di un problema. Fatture in Cloud ha restituito il seguente errore: ${e.error} [${e.error_code}]`,
                        data: err,
                        kind: NoticeKind.FIC_EXPORT,
                        error: true
                    });
                }
            }

            logger.info(`DONE! I EXPORTED ${response.exported.length} INVOICES TO FATTURE IN CLOUD! GOT ${response.errors.length} ERRORS.`);
            this.exportFlags = {
                exporting: false,
                exported: 0,
                to_export: 0,
                progress: 0
            };

            this.noticeService.save({
                user: exporter.id,
                title: "Fatture esportate correttamente",
                content: `Sono state esportate ${response.exported.length} fatture su Fatture in Cloud. Durante il processo si sono verificati ${response.errors.length} errori.`,
                data: response,
                kind: NoticeKind.INFO,
                error: false
            });
        })();
    }

    public getExportFlags() {
        return this.exportFlags;
    }

}
