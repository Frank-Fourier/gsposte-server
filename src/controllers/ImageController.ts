import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { ImageService } from "@services/ImageService";
import { Request, Response } from "express";

@provide(ImageController)
export class ImageController {

    @inject(ImageService) private imageService: ImageService;

    public async upload(req: Request, res: Response) {
        const filename = await this.imageService.upload(req, res);
        return res.status(201).send(filename);
    }

}
