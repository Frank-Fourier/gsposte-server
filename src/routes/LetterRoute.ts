import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { LetterController } from "@controllers/LetterController";

@provide(LetterRoute)
export class LetterRoute extends Route {

    @inject(LetterController) private letterController: LetterController;

    constructor() {
        super("/letter", [
            /**
             * @swagger
             *
             * /letter:
             *   post:
             *     tags:
             *       - Letters
             *     description: Create a new letter associated to a user
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: Letter to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/Letter"
             *     responses:
             *       201:
             *         description: Letter created correctly
             *         schema:
             *           $ref: "#/definitions/LetterDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.letterController.create(req, res)
            },
            /**
             * @swagger
             *
             * /letter/query:
             *   post:
             *     tags:
             *       - Letters
             *     description: Find letters associated with the user requesting. If admin, it ignores the association, you can find all of them.
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
                handler: (req, res) => this.letterController.find(req, res)
            },
            /**
             * @swagger
             *
             * /letter/{id}:
             *   get:
             *     tags:
             *       - Letters
             *     description: Find letter by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the letter to find
             *     responses:
             *       200:
             *         description: Letter found
             *         schema:
             *           $ref: "#/definitions/LetterDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to get info about letters of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.letterController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /letter/{id}:
             *   put:
             *     tags:
             *       - Letters
             *     description: Update letter by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the letter to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the Letter model
             *     responses:
             *       200:
             *         description: Updated letter
             *         schema:
             *           $ref: "#/definitions/LetterDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to update letters of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.letterController.updateById(req, res)
            },
            /**
             * @swagger
             *
             * /letter/{id}:
             *   delete:
             *     tags:
             *       - Letters
             *     description: Delete letter by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the letter to delete
             *     responses:
             *       200:
             *         description: Deleted letter
             *         schema:
             *           $ref: "#/definitions/LetterDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to delete letters of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.letterController.deleteById(req, res)
            }
        ]);
    }

}
