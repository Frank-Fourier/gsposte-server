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
             *         description: PDF file to upload. Max file size allowed is 100MB.
             *         required: true
             *         in: formData
             *         type: file
             *     responses:
             *       201:
             *         description: PDF uploaded correctly, returns its code (which is his filename)
             *       400:
             *         description: More than one file was passed to the request, or generic error while uploading.
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       406:
             *         description: Only PDF files are acceptable for upload.
             *       413:
             *         description: The provided file is too heavy. Only file sizes < 100MB are acceptable for upload.
             */
            {
                path: "/upload",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.pdfController.upload(req, res)
            },
            /**
             * @swagger
             *
             * /pdf/merge:
             *   post:
             *     tags:
             *       - PDF
             *     description: Merge one or more PDF files into a single one
             *     consumes:
             *       - application/json
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: PDF URLs array
             *         required: true
             *         in: body
             *         schema:
             *           type: object
             *           required:
             *             - urls
             *           properties:
             *             urls:
             *               type: array
             *               items:
             *                 type: string
             *     responses:
             *       201:
             *         description: PDF merged correctly, returns its code (you can access the PDF through /:code/original.pdf)
             *       400:
             *         description: You must provide one or more PDF URLs in the request body!
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/merge",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.pdfController.merge(req, res)
            }
        ]);
    }

}
