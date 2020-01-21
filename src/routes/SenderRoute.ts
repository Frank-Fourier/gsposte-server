import { RequestMethod, Route } from "@routes/Route";
import { inject } from "inversify";
import { SenderController } from "@controllers/SenderController";

export class SenderRoute extends Route {

    @inject(SenderController) private senderController: SenderController;

    constructor() {
        super("/sender", [
            /**
             * @swagger
             *
             * /sender:
             *   post:
             *     tags:
             *       - Senders
             *     description: Create a new sender associated to a user
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: Sender to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/Sender"
             *     responses:
             *       201:
             *         description: Sender created correctly
             *         schema:
             *           $ref: "#/definitions/SenderDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.senderController.create(req, res)
            },
            /**
             * @swagger
             *
             * /sender:
             *   get:
             *     tags:
             *       - Senders
             *     description: Find senders associated with the user requesting. If admin, it ignores the association, you can find all of them.
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
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.senderController.find(req, res)
            },
            /**
             * @swagger
             *
             * /sender/{id}:
             *   get:
             *     tags:
             *       - Senders
             *     description: Find sender by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Sender id
             *         required: true
             *         in: path
             *         description: Mongo id of the sender to find
             *     responses:
             *       200:
             *         description: Sender found
             *         schema:
             *           $ref: "#/definitions/SenderDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to get info about senders of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.senderController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /sender/{id}:
             *   put:
             *     tags:
             *       - Senders
             *     description: Update sender by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Sender id
             *         required: true
             *         in: path
             *         description: Mongo id of the sender to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the Sender model
             *     responses:
             *       200:
             *         description: Updated sender
             *         schema:
             *           $ref: "#/definitions/SenderDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to update senders of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.senderController.updateById(req, res)
            },
            /**
             * @swagger
             *
             * /sender/{id}:
             *   delete:
             *     tags:
             *       - Senders
             *     description: Delete sender by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Sender id
             *         required: true
             *         in: path
             *         description: Mongo id of the sender to delete
             *     responses:
             *       200:
             *         description: Deleted sender
             *         schema:
             *           $ref: "#/definitions/SenderDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to delete senders of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.senderController.deleteById(req, res)
            }
        ]);
    }

}
