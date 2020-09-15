import { CrudController } from "@controllers/CrudController";
import { inject } from "inversify";
import { InvoiceService } from "@services/InvoiceService";
import { LetterService } from "@services/LetterService";
import { Request, Response } from "express";

export class InvoiceController extends CrudController {

    constructor(
        @inject(InvoiceService) private invoiceService: InvoiceService,
        @inject(LetterService) private letterService: LetterService
    ) {
        super(invoiceService, true, true);
    }

    public async generateSingleInvoice(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const letterIds = req.body.letterIds as string[];

        const invoice = await this.invoiceService.generateSingleInvoice(
            await Promise.all(letterIds.map(id => this.letterService.findById(id))),
            req.body.startNumber
        );

        return res.status(201).send(invoice);
    }

    public async generateInvoicesForUser(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoices = await this.invoiceService.generateInvoicesForUser(req.params.id, req.body?.startNumber);
        return res.status(201).send(invoices);
    }

    public async generateInvoices(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoices = await this.invoiceService.generateInvoices(req.body?.startNumber);
        return res.status(201).send(invoices);
    }

    public async markInvoiceAsPaid(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const toMark = await this.invoiceService.findById(req.params.id);
        const updated = await this.invoiceService.markInvoiceAsPaid(toMark);
        return res.status(201).send(updated);
    }

}
