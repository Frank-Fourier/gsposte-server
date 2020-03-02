import { CrudController } from "@controllers/CrudController";
import { inject } from "inversify";
import { MunicipalityService } from "@services/MunicipalityService";
import { Request, Response } from "express";

export class MunicipalityController extends CrudController {

    constructor(@inject(MunicipalityService) private municipalityService: MunicipalityService) {
        super(municipalityService, false, true);
    }

    public async importFromJson(req: Request, res: Response) {
        await this.authService.adminOnly(req);

        const numImports = await this.municipalityService.importFromJSON(req.file.buffer);

        return res.status(201).send({
            message: `${numImports} municipalities have been imported!`,
            imported: numImports,
        });
    }

}
