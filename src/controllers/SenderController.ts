import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { CrudController } from "@controllers/CrudController";
import { SenderService } from "@services/SenderService";
import { Request, Response } from "express";
import { uploadXLSX } from "@utils/xlsx-uploader";
import fs from "fs";

@provide(SenderController)
export class SenderController extends CrudController {

    constructor(@inject(SenderService) private senderService: SenderService) {
        super(senderService, true);
    }

    public async importFromXLSX(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        // Save the document on filesystem
        const file = await uploadXLSX(req, res);
        const xlsx = await fs.promises.readFile(`${process.env.XLSX_ROOT}/${file}`);

        // Start the import process
        const result = await this.senderService.importFromXLSX(xlsx, user.id);

        // If it went good, delete the file from the system and return
        await fs.promises.unlink(`${process.env.XLSX_ROOT}/${file}`);
        return res.status(201).send(result);
    }

}
