import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { SenderService } from "@services/SenderService";
import { Sender } from "@models/SenderModel";
import { AuthService } from "@services/AuthService";
import httpErrors from "http-errors";

@provide(SenderController)
export class SenderController {

    @inject(SenderService) private senderService: SenderService;
    @inject(AuthService) private authService: AuthService;

    public async create(req: Request, res: Response) {
        this.senderService.validateObject(req.body);
        const user = await this.authService.getUserFromRequest(req);

        const sender = req.body as Sender;
        sender.user = user._id;
        const newSender = await this.senderService.save(sender);

        return res.status(201).send(newSender);
    }

    public async find(req: Request, res: Response) {
        const pagination = this.senderService.paginateOptionsFromObject(req.body.pagination);

        const user = await this.authService.getUserFromRequest(req);
        if (!user.isAdmin()) {
            // Modify the query so it will always retrieve only documents associated with the requesting user
            delete req.body.query.user; // If already present...
            req.body.query = {
                ...req.body.query,
                user: user._id
            }
        }
        const senders = await this.senderService.paginate(req.body.query, pagination, true);

        return res.status(200).send(senders);
    }

    public async findById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const sender = await this.senderService.findById(req.params.id);
        if (sender.user.toString() !== user._id.toString() && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to view senders that aren't yours!");
        }

        return res.status(200).send(sender);
    }

    public async updateById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const sender = await this.senderService.findById(req.params.id);
        if (sender.user.toString() !== user._id.toString() && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to update senders that aren't yours!");
        }
        const updated = await this.senderService.updateById(req.params.id, req.body);

        return res.status(200).send(updated);
    }

    public async deleteById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const sender = await this.senderService.findById(req.params.id);
        if (sender.user !== user._id && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to delete senders that aren't yours!");
        }
        const deleted = await this.senderService.deleteById(req.params.id);

        return res.status(200).send(deleted);
    }

}
