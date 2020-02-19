import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PdfService } from "@services/PdfService";

@provide(PdfController)
export class PdfController {

    @inject(PdfService) pdf: PdfService;

    public async upload(req: Request, res: Response) {
        // Upload the document
        const code = await this.pdf.upload(req, res);
        return res.status(201).send({ code: code });
    }

}
