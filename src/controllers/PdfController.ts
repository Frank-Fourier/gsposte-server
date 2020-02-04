import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PdfService } from "@services/PdfService";
import { generateUUID } from "@utils/random";

@provide(PdfController)
export class PdfController {

    @inject(PdfService) pdf: PdfService;

    public async upload(req: Request, res: Response) {
        // Generate the UUID and append it to body
        const uuid = generateUUID();
        req.body["uuid"] = uuid;

        // Upload the document
        // TODO: Finish this section
        await this.pdf.upload(req, res);

        return res.status(201).send({ uuid: uuid });
    }

}
