import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { RecipientController } from "@controllers/RecipientController";

@provide(RecipientRoute)
export class RecipientRoute extends Route {

    @inject(RecipientController) private recipientController: RecipientController;

    constructor() {
        super("/recipient", [
            /**
             * @swagger
             *
             * /recipient:
             *   post:
             *     tags:
             *       - Recipients
             *     description: Create a new recipient associated to a user
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: Recipient to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/Recipient"
             *     responses:
             *       201:
             *         description: Recipient created correctly
             *         schema:
             *           $ref: "#/definitions/RecipientDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.recipientController.create(req, res)
            },
            /**
             * @swagger
             *
             * /recipient/import:
             *   post:
             *     tags:
             *       - Recipients
             *     description: Import recipients from an XLSX file.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: file
             *         description: XLSX file containing the recipients to import.
             *         required: true
             *         in: formData
             *         type: file
             *     responses:
             *       201:
             *         description: Recipients imported correctly, returns the list of imported recipients and the errors that occured during the process.
             *         schema:
             *           $ref: "#/definitions/RecipientsImportResponse"
             *       400:
             *         description: More than one file was passed to the request, or generic error while uploading.
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       406:
             *         description: Only XLS/XLSX files are acceptable for upload.
             *       413:
             *         description: The provided file is too heavy. Only file sizes < 50MB are acceptable for upload.
             */
            {
                path: "/import",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.recipientController.importFromXLSX(req, res)
            },
            /**
             * @swagger
             *
             * /recipient/query:
             *   post:
             *     tags:
             *       - Recipients
             *     description: Find recipients associated with the user requesting. If admin, it ignores the association, you can find all of them.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Query model
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/QueryModel"
             *     responses:
             *       200:
             *         description: Query result
             *         schema:
             *           $ref: "#/definitions/Paginated"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/query",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.recipientController.find(req, res)
            },
            /**
             * @swagger
             *
             * /recipient/{id}:
             *   get:
             *     tags:
             *       - Recipients
             *     description: Find recipient by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the recipient to find
             *     responses:
             *       200:
             *         description: Recipient found
             *         schema:
             *           $ref: "#/definitions/RecipientDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to get info about recipients of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.recipientController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /recipient/{id}:
             *   put:
             *     tags:
             *       - Recipients
             *     description: Update recipient by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the recipient to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the Recipient model
             *     responses:
             *       200:
             *         description: Updated recipient
             *         schema:
             *           $ref: "#/definitions/RecipientDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to update recipients of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.recipientController.updateById(req, res)
            },
            /**
             * @swagger
             *
             * /recipient/{id}:
             *   delete:
             *     tags:
             *       - Recipients
             *     description: Delete recipient by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the recipient to delete
             *     responses:
             *       200:
             *         description: Deleted recipient
             *         schema:
             *           $ref: "#/definitions/RecipientDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to delete recipients of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.recipientController.deleteById(req, res)
            }
        ]);
    }

}
