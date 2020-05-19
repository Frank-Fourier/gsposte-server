import { CrudController } from "@controllers/CrudController";
import { inject } from "inversify";
import { InvoiceService } from "@services/InvoiceService";
import { LetterService } from "@services/LetterService";
import { Request, Response } from "express";
import httpErrors from "http-errors";

export class InvoiceController extends CrudController {

    constructor(
        @inject(InvoiceService) private invoiceService: InvoiceService,
        @inject(LetterService) private letterService: LetterService
    ) {
        super(invoiceService, true, true);
    }

    public async generateSingleInvoice(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        if (!(req.body instanceof Array)) {
            throw new httpErrors.BadRequest("Body must be an array of letter ids!");
        }

        const letterIds = req.body as Array<string>;
        const invoiceNumber = req.header("X-Invoice-Number");

        const invoice = await this.invoiceService.generateSingleInvoice(
            await Promise.all(letterIds.map(id => this.letterService.findById(id))),
            invoiceNumber ? parseInt(invoiceNumber) : undefined
        );

        return res.status(201).send(invoice);
    }

    public async generateInvoicesForUser(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoices = await this.invoiceService.generateInvoicesForUser(req.params.id);
        return res.status(201).send(invoices);
    }

    public async generateInvoices(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoices = await this.invoiceService.generateInvoices();
        return res.status(201).send(invoices);
    }

    public async markInvoiceAsPaid(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const toMark = await this.invoiceService.findById(req.params.id);
        const updated = await this.invoiceService.markInvoiceAsPaid(toMark);
        return res.status(201).send(updated);
    }

}
