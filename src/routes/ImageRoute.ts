import { provide } from "inversify-binding-decorators";
import { RequestMethod, Route } from "@routes/Route";
import { inject } from "inversify";
import { ImageController } from "@controllers/ImageController";

@provide(ImageRoute)
export class ImageRoute extends Route {

    constructor(@inject(ImageController) private imageController: ImageController) {
        super("/image", [
            /**
             * @swagger
             *
             * /image/upload:
             *   post:
             *     tags:
             *       - Images
             *     description: Upload new image
             *     consumes:
             *       - multipart/form-data
             *     produces:
             *       - application/json
             *     parameters:
             *       - name: file
             *         description: Image to upload
             *         required: true
             *         in: formData
             *         type: file
             *     security:
             *       - JWT: []
             *     responses:
             *       201:
             *         description: Filename of the image
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/upload",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.imageController.upload(req, res)
            },
        ]);
    }
}
