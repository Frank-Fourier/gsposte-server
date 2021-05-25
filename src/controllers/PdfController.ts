import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PdfService } from "@services/PdfService";
import httpErrors from "http-errors";

@provide(PdfController)
export class PdfController {

    @inject(PdfService) pdf: PdfService;

    public async upload(req: Request, res: Response) {
        // Upload the document
        const code = await this.pdf.upload(req, res);
        return res.status(201).send({ code });
    }

    public async merge(req: Request, res: Response) {
        const { urls } = req.body;
        if (!urls?.length) {
            throw new httpErrors.BadRequest("You must provide one or more PDF urls!");
        }

        const code = await this.pdf.merge(urls);
        return res.status(201).send({ code });
    }

}
