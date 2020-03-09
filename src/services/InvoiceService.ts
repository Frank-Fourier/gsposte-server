import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PdfService } from "@services/PdfService";
import { LetterService } from "@services/LetterService";
import { LetterDocument } from "@models/LetterModel";
import { SenderDocument } from "@models/SenderModel";
import { LetterKind, PostelStatus } from "@services/PostelService";
import { compileFile } from "pug";
import httpErrors from "http-errors";
import moment from "moment";
import { Document } from "mongoose";

@provide(InvoiceService)
export class InvoiceService {

    @inject(PdfService) pdf: PdfService;
    @inject(LetterService) letterService: LetterService;

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

        const html = compileFile(`${process.env.VIEWS_ROOT}/invoice.pug`)({
            sender: (sender as SenderDocument).toObject(),
            stats: (stats as Partial<Document>).toObject(),
            dateSent: sendAt ? moment(sendAt).format("DD/MM/YYYY") : null,
            partial: partial,
            codePdf: codePdf,
            kind: kind,
            price: price,
        });

        // TODO: Assicurarsi che gli envelopes.recipient siano corretti e sincronizzati con l'EnvelopeID
        // E' una cosa che mi preoccupa

        return await this.pdf.htmlToPdf(html);
    }

}
