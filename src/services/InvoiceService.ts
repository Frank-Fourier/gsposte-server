import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PdfService } from "@services/PdfService";
import { LetterService } from "@services/LetterService";
import { LetterDocument } from "@models/LetterModel";
import { SenderDocument } from "@models/SenderModel";
import { LetterKind, PostelStatus } from "@services/PostelService";
import { compileFile } from "pug";
import { Document } from "mongoose";
import httpErrors from "http-errors";
import moment from "moment";

@provide(InvoiceService)
export class InvoiceService {

    @inject(PdfService) pdf: PdfService;
    @inject(LetterService) letterService: LetterService;

    /**
     * Generates an invoice for a letter. If the letter has not completed stats yet, it is a partial invoice.
     * You can't generate an invoice for letters that are not yet sent!
     *
     * @param letter {LetterDocument} Letter to generate invoice from
     * @returns {Promise<Buffer>} Promise resolving to the PDF file as Buffer
     */
    public async generateInvoice(letter: LetterDocument): Promise<Buffer> {
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

        // Format currency
        const formatCurrency = (price: number) => {
            const [ int, decimal ] = price.toPrecision(3).split(".");
            return `${int},${decimal.padEnd(2, "0")} €`;
        };

        const html = compileFile(`${process.env.VIEWS_ROOT}/invoice.pug`)({
            sender: (sender as SenderDocument).toObject(),
            stats: (stats as Partial<Document>).toObject(),
            dateSent: sendAt ? moment(sendAt).format("DD/MM/YYYY") : null,
            partial: partial,
            codePdf: codePdf,
            kind: kind,
            price: formatCurrency(price),
            total: formatCurrency(price * stats.envelopes.length),
        });

        // I want until networkidle2 to let all the images on the HTML load before converting
        return await this.pdf.htmlToPdf(html, "networkidle2");
    }

}
