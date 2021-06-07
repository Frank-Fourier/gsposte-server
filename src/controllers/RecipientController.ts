import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { RecipientService } from "@services/RecipientService";
import { CrudController } from "@controllers/CrudController";
import { Request, Response } from "express";
import fs from "fs";
import { uploadXLSX } from "@utils/xlsx-uploader";

@provide(RecipientController)
export class RecipientController extends CrudController {

    constructor(@inject(RecipientService) private recipientService: RecipientService) {
        super(recipientService, true);
    }

    public async importFromXLSX(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        // Save the document on filesystem
        const file = await uploadXLSX(req, res);
        const xlsx = await fs.promises.readFile(`${process.env.XLSX_ROOT}/${file}`);

        // Start the import process
        const result = await this.recipientService.importFromXLSX(xlsx, user.id, file);

        // If it went good, delete the file from the system and return
        await fs.promises.unlink(`${process.env.XLSX_ROOT}/${file}`);
        return res.status(201).send(result);
    }

    public async exportToXLSX(req: Request, res: Response) {
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
        const buffer = await this.recipientService.exportToXLSX(req.body);

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return res.send(buffer);
    }

}
