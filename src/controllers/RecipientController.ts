import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { RecipientService } from "@services/RecipientService";
import { CrudController } from "@controllers/CrudController";
import { Request, Response } from "express";
import fs from "fs";

@provide(RecipientController)
export class RecipientController extends CrudController {

    constructor(@inject(RecipientService) private recipientService: RecipientService) {
        super(recipientService, true);
    }

    public async importFromXLSX(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        // Save the document on filesystem
        const file = await this.recipientService.upload(req, res);
        const xlsx = await fs.promises.readFile(`${process.env.XLSX_ROOT}${file}`);

        // Start the import process
        const result = await this.recipientService.importFromXLSX(xlsx, user.id);

        // If it went good, delete the file from the system and return
        await fs.promises.unlink(`${process.env.XLSX_ROOT}${file}`);
        return res.status(201).send(result);
    }

}
