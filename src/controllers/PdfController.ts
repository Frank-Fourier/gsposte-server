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
        const urls = req.body.urls as string[];
        if (!urls?.length) {
            throw new httpErrors.BadRequest("Lista di URL vuota. Non è possibile procedere all'unione dei file.");
        }
        if (!urls.every(url => url.startsWith(process.env.SERVER_HOST))) {
            throw new httpErrors.BadRequest(`Tutti gli URL devono cominciare con ${process.env.SERVER_HOST} per ragioni di sicurezza.`);
        }

        const code = await this.pdf.merge(urls);
        return res.status(201).send({ code });
    }

}
