import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { TvUserController } from "@controllers/tv/TvUserController";

@provide(TvUserRoute)
export class TvUserRoute extends Route {

    constructor(@inject(TvUserController) private tvUserController: TvUserController) {
        super("/tv/user", [
            /**
             * @swagger
             *
             * /tv/user:
             *   post:
             *     tags:
             *       - TV Users
             *     description: Create a new TV user. Only TV managers (and admins) can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: TV user to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/TvUser"
             *     responses:
             *       201:
             *         description: TV user created correctly
             *         schema:
             *           $ref: "#/definitions/TvUserDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.tvUserController.create(req, res)
            },
            /**
             * @swagger
             *
             * /tv/user/query:
             *   post:
             *     tags:
             *       - TV Users
             *     description: Find TV users with a query and pagination options. Only TV managers (and admins) can do this!
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
                handler: (req, res) => this.tvUserController.find(req, res)
            },
            /**
             * @swagger
             *
             * /tv/user/{id}:
             *   get:
             *     tags:
             *       - TV Users
             *     description: Find a TV user by id. Only TV managers (and admins) can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the TV user to find
             *     responses:
             *       200:
             *         description: TV user found
             *         schema:
             *           $ref: "#/definitions/TvUserDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.tvUserController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /tv/user/{id}:
             *   put:
             *     tags:
             *       - TV Users
             *     description: Update TV user by its id. Only TV managers (and admins) can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the TV user to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the TV user model
             *     responses:
             *       200:
             *         description: Updated TV user
             *         schema:
             *           $ref: "#/definitions/TvUserDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                path: "/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.tvUserController.updateById(req, res)
            },
            /**
             * @swagger
             *
             * /tv/user/{id}:
             *   delete:
             *     tags:
             *       - TV Users
             *     description: Delete TV user by its id. Only TV managers (and admins) can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the TV user to delete
             *     responses:
             *       200:
             *         description: Deleted TV user
             *         schema:
             *           $ref: "#/definitions/TvUserDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                path: "/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.tvUserController.deleteById(req, res)
            }
        ]);
    }

}
