import { CrudController } from "@controllers/CrudController";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { TvReportService } from "@services/tv/TvReportService";
import { UserRoles } from "@models/UserModel";
import { Request, Response } from "express";

@provide(TvReportController)
export class TvReportController extends CrudController {

    constructor(@inject(TvReportService) private tvReportService: TvReportService) {
        super(tvReportService, true, false, UserRoles.ROLE_TV_MANAGER);
    }

    public async upload(req: Request, res: Response) {
        await this.authService.roleOnly(req, this.accessRole);

        // Upload the document
        const filename = await this.tvReportService.upload(req, res);
        return res.status(201).send({ filename: filename });
    }

    public async fetch(req: Request, res: Response) {
        // This method basically does exactly what query does **but** it only works for a TV user.
        // It's what you need to call from the actual TV app
        const tvUser = await this.authService.getTvUserFromRequest(req);
        req.body.query = {
            ...req.body.query,
            tvUser: tvUser.id
        };

        const pagination = this.tvReportService.paginateOptionsFromObject(req.body.pagination);
        const result = !req.body.query["$text"]
            ? await this.tvReportService.paginate(req.body.query, pagination)
            : await this.tvReportService.searchByText(req.body.query["$text"], pagination);
        return res.status(200).send(result);
    }

    public async fetchById(req: Request, res: Response) {
        // This method basically does exactly what findById does **but** it only works for a TV user.
        // It's what you need to call from the actual TV app
        const tvUser = await this.authService.getTvUserFromRequest(req);
        const report = await this.tvReportService.findOne({
            tvUser: tvUser.id,
            _id: req.params.id,
        });

        return res.status(200).send(report);
    }

}


