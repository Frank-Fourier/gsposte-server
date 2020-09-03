import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PdfService } from "@services/PdfService";
import { LetterDocument } from "@models/LetterModel";
import { SenderDocument } from "@models/SenderModel";
import { Invoice, invoiceDecoder, InvoiceDocument, InvoiceModel } from "@models/InvoiceModel";
import { PriceService } from "@services/PriceService";
import { LetterService } from "@services/LetterService";
import { UserService } from "@services/UserService";
import { compileFile } from "pug";
import { Document } from "mongoose";
import { MongoRepository } from "@services/MongoRepository";
import httpErrors from "http-errors";
import moment from "moment";
import { logger } from "@utils/winston";

const groupBy = <T>(array: Array<T>, property: (x: T) => string): { [key: string]: Array<T> } =>
    array.reduce((memo: { [key: string]: Array<T> }, x: T) => {
        if (!memo[property(x)]) memo[property(x)] = [];
        memo[property(x)].push(x);
        return memo;
    }, {});

@provide(InvoiceService)
export class InvoiceService extends MongoRepository<Invoice, InvoiceDocument> {

    @inject(PdfService) private pdf: PdfService;
    @inject(PriceService) private priceService: PriceService;
    @inject(UserService) private userService: UserService;
    @inject(LetterService) private letterService: LetterService;

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
     * @param number {number} Optional invoice number. Will use the latest number + 1 if not passed
     * @returns Promise resolving to the invoice created and any errors that occured during the process
     */
    public async generateSingleInvoice(letters: Array<LetterDocument>, number?: number): Promise<{
        invoice: InvoiceDocument,
        errors: Array<{ letter: LetterDocument, error: Error | any }>
    }> {
        if (letters.length === 0) {
            throw new httpErrors.BadRequest("Letters array is empty! Can't generate invoice.");
        }

        const errors: Array<{ letter: LetterDocument, error: Error | any }> = [];
        let taxableSum = 0;

        for (const letter of letters) {
            await letter.depopulate("sender user");
            if (letter.sender.toString() !== letters[0].sender.toString()) {
                throw new httpErrors.BadRequest("Letters to generate an invoice from must all have the same sender!");
            }

            try {
                if (!letter.sent) {
                    throw new httpErrors.BadRequest("This letter is not sent so I won't include it in the invoice.");
                }
                if (!letter.error) {
                    throw new httpErrors.BadRequest("This letter is in an error state so I won't include it in the invoice.");
                }

                const taxable = await this.priceService.calculatePrice(letter);
                if (taxable <= 0) {
                    throw new httpErrors.BadRequest("Can't create an invoice for a letter without a price!");
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
            taxable: parseFloat(taxableSum.toPrecision(2)),
            iva: parseFloat(iva.toPrecision(2)),
            total: parseFloat(total.toPrecision(2)),
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
     * @returns Array of results of generateSingleInvoice, one for each letter
     */
    public async generateInvoicesForUser(user: string): Promise<Array<{
        invoice: InvoiceDocument,
        errors: Array<{ letter: LetterDocument, error: Error | any }>
    }>> {
        const letters = await this.letterService.find({
            user: user,
            sent: true,
            paid: false,
            error: false,
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

        for (const letter of Object.values(aggregated)) {
            const lastNumber = await this.getLatestInvoiceNumber();
            const invoice = await this.generateSingleInvoice(letter, lastNumber + 1);
            results.push(invoice);
        }

        return results;
    }

    /**
     * The most generic flavor of generateSingleInvoice, generates all the possible invoices, for every single user!
     *
     * @returns Key-value where each key is the user id, and each value is the array of results
     */
    public async generateInvoices(): Promise<{
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
            const res = await this.generateInvoicesForUser(user.id);
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
        }, { sort: { "createdAt": 1 } }));
        if (!invoices || invoices.length === 0) {
            return 0;
        }

        return invoices[0].number;
    }

    /**
     * Marks an invoice as paid. This means that its 'paid' property becomes true, as well as all the
     * 'paid' properties of the letters associated with this invoice.
     *
     * @param invoice {InvoiceDocument} Invoice to mark as paid
     * @returns {Promise<InvoiceDocument>} Promise resolving to the updated invoice document
     */
    public async markInvoiceAsPaid(invoice: InvoiceDocument): Promise<InvoiceDocument> {
        invoice = await invoice.populate("letters").execPopulate();
        await Promise.all(
            invoice.letters.map(letter =>
                this.letterService.updateById((letter as LetterDocument).id, {
                    $set: { paid: true }
                })
            )
        );
        return await this.updateById(invoice.id, {
            $set: { paid: true, paymentDate: Date.now() }
        });
    }

    /**
     * Generates an invoice for a letter. If the letter has not completed stats yet, it is a partial invoice.
     * You can't generate an invoice for letters that are not yet sent!
     * Please note that this does not generate a real invoice, rather a note for a single letter. "Distinta"
     *
     * @param letter {LetterDocument} Letter to generate invoice from
     * @returns {Promise<Buffer>} Promise resolving to the PDF file as Buffer
     */
    public async generateLetterInvoicePDF(letter: LetterDocument): Promise<Buffer> {
        if (!letter.sent) {
            throw new httpErrors.Forbidden("You are not allowed to create an invoice for a letter that was not sent!");
        }
        if (letter.error) {
            throw new httpErrors.Forbidden("You are not allowed to create an invoice for an errored letter!");
        }
        if (!letter.posteway) {
            throw new httpErrors.BadRequest("The letter has no 'posteway' field, so I can't generate an invoice.");
        }

        await letter.populate("sender recipients").execPopulate();

        try {
            // Call PosteWay to get the latest info
            await this.letterService.queryLetter(letter);
        } catch (err) {
            logger.warn(`[INVOICE ${letter.codePdf}] Failed to query letter on PosteWay!`, err);
        }

        const price = await this.priceService.calculatePrice(letter);

        // Format envelopes dates
        letter.posteway.track.recipients = letter.posteway.track.recipients?.map(e => ({
            ...e,
            tracking: e.tracking ? {
                ...e.tracking,
                date: e.tracking.date ? moment(e.tracking.date, "DD/MM/YYYY hh:mm:ss").format("DD/MM/YYYY") : null
            } : undefined,
        }));

        const html = compileFile(`${process.env.VIEWS_ROOT}/invoice.pug`)({
            sender: letter.sender ? (letter.sender as SenderDocument).toObject() : {},
            posteway: (letter.posteway as Partial<Document>).toObject() || {},
            dateSent: letter.sendAt ? moment(letter.sendAt).format("DD/MM/YYYY") : null,
            partial: false,
            codePdf: letter.codePdf,
            kind: letter.kind,
            price: this.formatCurrency(price),
            total: this.formatCurrency(price * letter.posteway.track.recipients.length),
        });

        // I wait until networkidle2 to let all the images on the HTML load before converting
        return await this.pdf.htmlToPdf(html, "networkidle2");
    }

    public formatCurrency(price: number): string {
        const [ int, decimal ] = price.toPrecision(3).split(".");
        return `${int},${decimal?.padEnd(2, "0") || "00"} €`;
    }

}
