import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { RubricController } from "@controllers/RubricController";

@provide(RubricRoute)
export class RubricRoute extends Route {

    @inject(RubricController) private rubricController: RubricController;

    constructor() {
        super("/rubric", [
            /**
             * @swagger
             *
             * /rubric:
             *   post:
             *     tags:
             *       - Rubrics
             *     description: Create a new rubric associated to a user
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: Rubric to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/Rubric"
             *     responses:
             *       201:
             *         description: Rubric created correctly
             *         schema:
             *           $ref: "#/definitions/RubricDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.rubricController.create(req, res)
            },
            /**
             * @swagger
             *
             * /rubric/query:
             *   post:
             *     tags:
             *       - Rubrics
             *     description: Find rubrics associated with the user requesting. If admin, it ignores the association, you can find all of them.
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
                handler: (req, res) => this.rubricController.find(req, res)
            },
            /**
             * @swagger
             *
             * /rubric/{id}:
             *   get:
             *     tags:
             *       - Rubrics
             *     description: Find rubric by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the rubric to find
             *     responses:
             *       200:
             *         description: Rubric found
             *         schema:
             *           $ref: "#/definitions/RubricDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to get info about rubrics of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.rubricController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /rubric/{id}:
             *   put:
             *     tags:
             *       - Rubrics
             *     description: Update rubric by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the rubric to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the Rubric model
             *     responses:
             *       200:
             *         description: Updated rubric
             *         schema:
             *           $ref: "#/definitions/RubricDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to update rubrics of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.rubricController.updateById(req, res)
            },
            /**
             * @swagger
             *
             * /rubric/{id}:
             *   delete:
             *     tags:
             *       - Rubrics
             *     description: Delete rubric by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the rubric to delete
             *     responses:
             *       200:
             *         description: Deleted rubric
             *         schema:
             *           $ref: "#/definitions/RubricDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to delete rubrics of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.rubricController.deleteById(req, res)
            }
        ]);
    }

}
