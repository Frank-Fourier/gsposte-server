import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { CrudController } from "@controllers/CrudController";
import { LetterService } from "@services/LetterService";
import { InvoiceService } from "@services/InvoiceService";
import { Request, Response } from "express";
import { PDF_ROOT } from "@services/PdfService";
import httpErrors from "http-errors";
import fs from "fs";

@provide(LetterService)
export class LetterController extends CrudController {

    constructor(
        @inject(LetterService) private letterService: LetterService,
        @inject(InvoiceService) private invoiceService: InvoiceService,
    ) {
        super(letterService, true);
    }

    public async updateById(req: Request, res: Response) {
        const letter = await this.letterService.findById(req.params.id);
        if (letter.sent) {
            throw new httpErrors.Forbidden("This letter is marked as sent, so it can't be updated anymore.");
        }

        // Can proceed with the update call
        return super.updateById(req, res);
    }

    public async generateInvoice(req: Request, res: Response) {
        const letter = await this.letterService.findById(req.params.id);

        const user = await this.authService.getUserFromRequest(req);
        if (!user.isAdmin() && letter.user !== user.id) {
            throw new httpErrors.Forbidden("You are not authorized to generate invoices for other users!");
        }

        const pdf = await this.invoiceService.generateLetterInvoicePDF(letter);
        const path = `${PDF_ROOT}/${letter.codePdf}/invoice.pdf`;
        await fs.promises.writeFile(path, pdf);

        return res.status(201).send({
            message: `Invoice created correctly. Available at ${path}`,
            url: `${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/documents/${letter.codePdf}/invoice.pdf`
        });
    }

    public async updateStatus(req: Request, res: Response) {
        const letter = await this.letterService.findById(req.params.id);

        const user = await this.authService.getUserFromRequest(req);
        if (!user.isAdmin() && letter.user !== user.id) {
            throw new httpErrors.Forbidden("You are not authorized to update letters from other users!");
        }

        const doc = await this.letterService.queryLetter(letter);
        return res.status(200).send(doc);
    }

}
