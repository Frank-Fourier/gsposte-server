import { CrudController } from "@controllers/CrudController";
import { inject } from "inversify";
import { INVOICES_ROOT, InvoiceService } from "@services/InvoiceService";
import { LetterService } from "@services/LetterService";
import { Request, Response } from "express";
import { BadRequest } from "http-errors";
import fs from "fs";

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
            req.body.startNumber ? (req.body.startNumber - 1) : null
        );

        return res.status(201).send(invoice);
    }

    public async generateInvoicesForUser(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoices = await this.invoiceService.generateInvoicesForUser(
            req.params.id, req.body?.startNumber ? (req.body?.startNumber - 1) : null
        );
        return res.status(201).send(invoices);
    }

    public async generateInvoices(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoices = await this.invoiceService.generateInvoices(
            req.body?.startNumber ? (req.body?.startNumber - 1) : null
        );
        return res.status(201).send(invoices);
    }

    public async toggleInvoicePaid(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const toMark = await this.invoiceService.findById(req.params.id);
        const updated = await this.invoiceService.toggleInvoicePaid(toMark);
        return res.status(201).send(updated);
    }

    public async generateInvoicePDF(req: Request, res: Response) {
        if (!req.params.id) {
            throw new BadRequest("Invoice ID is required");
        }

        const invoice = await this.invoiceService.findById(req.params.id);
        const pdf = await this.invoiceService.generateInvoicePDF(invoice);
        const path = `${INVOICES_ROOT}/invoice_${invoice.id}.pdf`;
        await fs.promises.writeFile(path, pdf);

        return res.status(201).send({
            message: `Invoice PDF created correctly. Available at ${path}`,
            url: `${process.env.SERVER_HOST}${(process.env.NODE_ENV === "production" ? "" : `:${process.env.SERVER_PORT}`)}/invoices/invoice_${invoice.id}.pdf`
        });
    }

    public async exportOneToFIC(req: Request, res: Response) {
        const user = await this.authService.adminOnly(req);
        if (!req.params.id) {
            throw new BadRequest("Invoice ID is required");
        }

        const invoice = await this.invoiceService.findById(req.params.id);
        const exported = await this.invoiceService.exportToFIC(user, invoice);

        return res.status(200).send(exported);
    }

    public async bulkExportToFIC(req: Request, res: Response) {
        const user = await this.authService.adminOnly(req);
        await this.invoiceService.bulkExportToFIC(user, true);
        return res.status(200).send({
            message: "Started export process on FIC"
        });
    }

    public async getExportFlags(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        return res.status(200).send(this.invoiceService.getExportFlags());
    }

}
