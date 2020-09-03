import { provide } from "inversify-binding-decorators";
import { Request, Response } from "express";
import { inject } from "inversify";
import { ProvisionService } from "@services/ProvisionService";
import { LetterService } from "@services/LetterService";
import httpErrors from "http-errors";

@provide(ProvisionController)
export class ProvisionController {

    @inject(ProvisionService) private provisionService: ProvisionService;
    @inject(LetterService) private letterService: LetterService;

    public async generate(req: Request, res: Response) {
        const letterId = req.params.letterId;
        if (!letterId) {
            throw new httpErrors.BadRequest("Letter ID is required to generate a provision.");
        }

        const letter = await this.letterService.findById(letterId);
        letter.provision = await this.provisionService.generateProvision(letter);
        await letter.save();

        return res.status(201).send(letter.provision);
    }

    public async find(req: Request, res: Response) {
        const pagination = this.provisionService.paginateOptionsFromObject(req.body.pagination);
        const provisions = await this.provisionService.paginate(req.body.query, pagination);
        return res.status(200).send(provisions);
    }

    public async calculateRevenue(req: Request, res: Response) {
        if (!req.params.userId) {
            throw new httpErrors.BadRequest("User ID is required.");
        }
        const revenue = await this.provisionService.calculateRevenue(req.params.userId, req.body || {});
        return res.status(200).send({ revenue });
    }

    public async calculateRevenuesMonthly(req: Request, res: Response) {
        if (!req.params.userId) {
            throw new httpErrors.BadRequest("User ID is required.");
        }
        const revenues = await this.provisionService.calculateRevenuesMonthly(req.params.userId);
        return res.status(200).send(revenues);
    }

    public async calculateRevenueYearly(req: Request, res: Response) {
        if (!req.params.userId) {
            throw new httpErrors.BadRequest("User ID is required.");
        }
        const revenues = await this.provisionService.calculateRevenueYearly(req.params.userId);
        return res.status(200).send(revenues);
    }

}
