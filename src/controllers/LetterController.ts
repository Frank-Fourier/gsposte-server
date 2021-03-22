import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { CrudController } from "@controllers/CrudController";
import { LetterService } from "@services/LetterService";
import { InvoiceService } from "@services/InvoiceService";
import { Request, Response } from "express";
import httpErrors from "http-errors";

@provide(LetterService)
export class LetterController extends CrudController {

    constructor(
        @inject(LetterService) private letterService: LetterService,
        @inject(InvoiceService) private invoiceService: InvoiceService,
    ) {
        super(letterService, true);
    }

    public async find(req: Request, res: Response) {
        await this.authService.roleOnly(req, this.accessRole);
        const pagination = this.letterService.paginateOptionsFromObject(req.body.pagination);

        if (this.userBased) {
            const user = await this.authService.getUserFromRequest(req);
            if (!user.isAdmin()) {
                // Modify the query so it will always retrieve only documents associated with the requesting user
                delete req.body.query.user; // If already present...
                req.body.query = {
                    ...req.body.query,
                    user: user.id
                }
            }
        }

        if (!!req.body.query["$senderName"]) {
            const senderName = req.body.query["$senderName"];
            delete req.body.query["$senderName"];
            const result = await this.letterService.paginateBySenderName(senderName, req.body.query, pagination);
            return res.status(200).send(result);
        }
        if (!!req.body.query["$recipientName"]) {
            const recipientName = req.body.query["$recipientName"];
            delete req.body.query["$recipientName"];
            const result = await this.letterService.paginateByRecipientName(recipientName, req.body.query, pagination);
            return res.status(200).send(result);
        }

        const result = await this.letterService.paginate(req.body.query, pagination);
        return res.status(200).send(result);
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
        if (!req.params.id) {
            throw new httpErrors.BadRequest("Letter ID is required");
        }
        const letter = (await this.letterService.findById(req.params.id)).depopulate("user");

        // const user = await this.authService.getUserFromRequest(req);
        // if (!user.isAdmin() && letter.user !== user.id) {
        //     throw new httpErrors.Forbidden("You are not authorized to generate invoices for other users!");
        // }

        const path = await this.invoiceService.generateLetterInvoicePDF(letter);

        return res.status(201).send({
            message: `Invoice created correctly. Available at ${path}`,
            url: `${process.env.SERVER_HOST}${(process.env.NODE_ENV === "production" ? "" : `:${process.env.SERVER_PORT}`)}/documents/${letter.codePdf}/invoice.pdf`
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
