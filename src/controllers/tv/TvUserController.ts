import { CrudController } from "@controllers/CrudController";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { TvUserService } from "@services/tv/TvUserService";
import { UserRoles } from "@models/UserModel";
import { Request, Response } from "express";
import fs from "fs";

@provide(TvUserController)
export class TvUserController extends CrudController {

    constructor(@inject(TvUserService) private tvUserService: TvUserService) {
        super(tvUserService, true, false, UserRoles.ROLE_TV_MANAGER);
    }

    public async importFromXLSX(req: Request, res: Response) {
        await this.authService.roleOnly(req, this.accessRole);
        const user = await this.authService.getUserFromRequest(req);

        // Save the document on filesystem
        const file = await this.tvUserService.upload(req, res);
        const xlsx = await fs.promises.readFile(`${process.env.XLSX_ROOT}/${file}`);

        // Start the import process
        const result = await this.tvUserService.importFromXLSX(xlsx, user.id);

        // If it went good, delete the file from the system and return
        await fs.promises.unlink(`${process.env.XLSX_ROOT}/${file}`);
        return res.status(201).send(result);
    }

    public async exportToXLSX(req: Request, res: Response) {
        await this.authService.roleOnly(req, this.accessRole);
        const user = await this.authService.getUserFromRequest(req);
        if (!user.isAdmin()) {
            // Modify the query so it will always retrieve only documents associated with the requesting user
            delete req.body.user; // If already present...
            req.body = {
                ...req.body,
                user: user.id
            }
        }

        // Start the export job
        const buffer = await this.tvUserService.exportToXLSX(req.body);

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return res.send(buffer);
    }

}
