import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { RecipientService } from "@services/RecipientService";
import { AuthService } from "@services/AuthService";
import { Recipient } from "@models/RecipientModel";
import httpErrors from "http-errors";

@provide(RecipientController)
export class RecipientController {

    @inject(RecipientService) private recipientService: RecipientService;
    @inject(AuthService) private authService: AuthService;

    public async create(req: Request, res: Response) {
        this.recipientService.validateObject(req.body);
        const user = await this.authService.getUserFromRequest(req);

        const recipient = req.body as Recipient;
        if (!recipient.user || (recipient.user && !user.isAdmin())) {
            // Force the associated user to be the request user
            recipient.user = user._id;
        }

        const newRecipient = await this.recipientService.save(recipient);

        return res.status(201).send(newRecipient);
    }

    public async find(req: Request, res: Response) {
        const pagination = this.recipientService.paginateOptionsFromObject(req.body.pagination);

        const user = await this.authService.getUserFromRequest(req);
        if (!user.isAdmin()) {
            // Modify the query so it will always retrieve only documents associated with the requesting user
            delete req.body.query.user; // If already present...
            req.body.query = {
                ...req.body.query,
                user: user._id
            }
        }
        const recipients = await this.recipientService.paginate(req.body.query, pagination, true);

        return res.status(200).send(recipients);
    }

    public async findById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const recipient = await this.recipientService.findById(req.params.id);
        if (recipient.user.toString() !== user._id.toString() && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to view recipients that aren't yours!");
        }

        return res.status(200).send(recipient);
    }

    public async updateById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const recipient = await this.recipientService.findById(req.params.id);
        if (recipient.user.toString() !== user._id.toString() && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to update recipients that aren't yours!");
        }
        const updated = await this.recipientService.updateById(req.params.id, req.body);

        return res.status(200).send(updated);
    }

    public async deleteById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const recipient = await this.recipientService.findById(req.params.id);
        if (recipient.user !== user._id && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to delete recipients that aren't yours!");
        }
        const deleted = await this.recipientService.deleteById(req.params.id);

        return res.status(200).send(deleted);
    }

}
