import { provide } from "inversify-binding-decorators";
import { Request, Response } from "express";
import { inject } from "inversify";
import { ProvisionService } from "@services/ProvisionService";

@provide(ProvisionController)
export class ProvisionController {

    @inject(ProvisionService) private provisionService: ProvisionService;

    public async find(req: Request, res: Response) {
        const pagination = this.provisionService.paginateOptionsFromObject(req.body.pagination);
        const provisions = await this.provisionService.paginate(req.body.query, pagination);
        return res.status(200).send(provisions);
    }

    public async calculateRevenue(req: Request, res: Response) {
        const revenue = await this.provisionService.calculateRevenue(req.params.userId);
        return res.status(200).send({ revenue });
    }

    public async calculateRevenuesMonthly(req: Request, res: Response) {
        const revenues = await this.provisionService.calculateRevenuesMonthly(req.params.userId);
        return res.status(200).send(revenues);
    }

}
