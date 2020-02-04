import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PdfController } from "@controllers/PdfController";

@provide(PdfRoute)
export class PdfRoute extends Route {

    @inject(PdfController) pdfController: PdfController;

    constructor() {
        super("/pdf", [
            /**
             * @swagger
             *
             * /pdf/upload:
             *   post:
             *     tags:
             *       - PDF
             *     description: Upload a new PDF file
             *     consumes:
             *       - multipart/form-data
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: file
             *         description: PDF file to upload. Max file size allowed is 10MB. Max page size allowed is 10KB
             *         required: true
             *         in: formData
             *         type: file
             *     responses:
             *       201:
             *         description: PDF uploaded correctly, returns the UUID associated with it
             *         schema:
             *           type: object
             *           properties:
             *             uuid:
             *               type: string
             *               description: The unique identifier associated with the uploaded PDF.
             *       400:
             *         description: More than one file was passed to the request, or generic error while uploading.
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       406:
             *         description: Only PDF files are acceptable for upload.
             *       413:
             *         description: The provided file is too heavy. Only file sizes < 10MB are acceptable for upload.
             */
            {
                path: "/upload",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.pdfController.upload(req, res)
            }
        ]);
    }

}
