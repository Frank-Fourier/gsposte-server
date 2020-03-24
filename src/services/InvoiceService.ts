import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PdfService } from "@services/PdfService";
import { LetterDocument } from "@models/LetterModel";
import { SenderDocument } from "@models/SenderModel";
import { Invoice, invoiceDecoder, InvoiceDocument, InvoiceModel } from "@models/InvoiceModel";
import { LetterKind, PostelStatus } from "@services/PostelService";
import { PriceService } from "@services/PriceService";
import { compileFile } from "pug";
import { Document } from "mongoose";
import { MongoRepository } from "@services/MongoRepository";
import httpErrors from "http-errors";
import moment from "moment";

@provide(InvoiceService)
export class InvoiceService extends MongoRepository<Invoice, InvoiceDocument> {

    @inject(PdfService) pdf: PdfService;
    @inject(PriceService) priceService: PriceService;

    constructor(private invoiceModel = InvoiceModel) {
        super(invoiceModel, invoiceDecoder, [ "number" ]);
    }

    public async getLatestInvoiceNumber(): Promise<number> {
        const invoices = (await this.find({}, {
            sort: { "createdAt": 1 }
        }));
        if (!invoices || invoices.length === 0) {
            return 0;
        }

        return invoices[0].number;
    }

    public async createInvoicesForLetters(letters: Array<LetterDocument>, reqUser: string, number?: number): Promise<{
        invoice: InvoiceDocument,
        errors: Array<{
            letter: LetterDocument
            error: any
        }>
    }> {
        if (letters.length === 0) {
            throw new httpErrors.BadRequest("Letters array is empty! Can't calculate invoice.");
        }
        const errors: Array<{
            letter: LetterDocument,
            error: any
        }> = [];
        let taxables = 0;

        for (const letter of letters) {
            try {
                // Calculate prices
                const taxable = await this.priceService.calculatePrice(letter);
                if (taxable <= 0) {
                    throw new httpErrors.BadRequest("Can't create an invoice for a letter without a price!");
                }

                taxables += taxable;
            } catch (err) {
                errors.push({
                    letter: letter,
                    error: err
                });
            }
        }

        // Generate PDF

        // Create invoice
        const iva = (taxables * 22) / 100;
        const total = taxables + iva;
        const invoice = await this.save({
            user: reqUser,
            letters: letters,
            number: number || await this.getLatestInvoiceNumber(),
            taxable: taxables,
            iva: iva,
            total: total
        });

        return {
            invoice: invoice,
            errors: errors
        };
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
            throw new httpErrors.Forbidden("You are not allowed to create an invoice for a letter not yet sent!");
        }
        await letter.populate("sender recipients").execPopulate();

        const { sender, codePdf, stats, kind, sendAt, price } = letter;
        const partial = !stats ? true :
            stats.envelopes.some(envelope => envelope.status !== PostelStatus.Completato && (
                kind === LetterKind.LETTERA_SEMPLICE ? true : !!envelope.tracking
            ));

        // Format envelopes dates
        stats.envelopes = stats.envelopes.map(e => ({
            ...e,
            dateUploaded: e.dateUploaded ? moment(e.dateUploaded).format("DD/MM/YYYY") : null,
            dateCompleted: e.dateCompleted ? moment(e.dateCompleted).format("DD/MM/YYYY") : null,
        }));

        const html = compileFile(`${process.env.VIEWS_ROOT}/invoice.pug`)({
            sender: (sender as SenderDocument).toObject(),
            stats: (stats as Partial<Document>).toObject(),
            dateSent: sendAt ? moment(sendAt).format("DD/MM/YYYY") : null,
            partial: partial,
            codePdf: codePdf,
            kind: kind,
            price: this.formatCurrency(price),
            total: this.formatCurrency(price * stats.envelopes.length),
        });

        // I want until networkidle2 to let all the images on the HTML load before converting
        return await this.pdf.htmlToPdf(html, "networkidle2");
    }

    // Format currency
    public formatCurrency(price: number) {
        const [ int, decimal ] = price.toPrecision(3).split(".");
        return `${int},${decimal.padEnd(2, "0")} €`;
    }

}
