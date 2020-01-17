import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { SenderService } from "@services/SenderService";
import { Sender } from "@models/SenderModel";

@provide(SenderController)
export class SenderController {

    @inject(SenderService) private senderService: SenderService;

    public async create(req: Request, res: Response) {
        this.senderService.validateObject(req.body);

        const sender = req.body as Sender;
        const newSender = await this.senderService.save(sender);

        return res.status(201).send(newSender);
    }

    public async find(req: Request, res: Response) {
        const sender = await this.senderService.find(req.body);
        return res.status(200).send(sender);
    }

    public async findById(req: Request, res: Response) {
        const sender = await this.senderService.findById(req.params.id);
        return res.status(200).send(sender);
    }

    public async updateById(req: Request, res: Response) {
        const updated = await this.senderService.updateById(req.params.id, req.body);
        return res.status(200).send(updated);
    }

}
