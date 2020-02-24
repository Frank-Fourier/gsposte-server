import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { MunicipalityController } from "@controllers/MunicipalityController";

@provide(MunicipalityRoute)
export class MunicipalityRoute extends Route {

    @inject(MunicipalityController) private municipalityController: MunicipalityController;

    constructor() {
        super("/municipality", [
            /**
             * @swagger
             *
             * /municipality:
             *   post:
             *     tags:
             *       - Municipalities
             *     description: Create a new municipality. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: Municipality to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/Municipality"
             *     responses:
             *       201:
             *         description: Municipality created correctly
             *         schema:
             *           $ref: "#/definitions/MunicipalityDocument"
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
                handler: (req, res) => this.municipalityController.create(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/query:
             *   post:
             *     tags:
             *       - Municipalities
             *     description: Find municipalities with a query and pagination options.
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
                handler: (req, res) => this.municipalityController.find(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/{id}:
             *   get:
             *     tags:
             *       - Municipalities
             *     description: Find a municipality by id.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the municipality to find
             *     responses:
             *       200:
             *         description: Municipality found
             *         schema:
             *           $ref: "#/definitions/MunicipalityDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.municipalityController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/{id}:
             *   put:
             *     tags:
             *       - Municipalities
             *     description: Update municipality by its id. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the municipality to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the Municipality model
             *     responses:
             *       200:
             *         description: Updated municipality
             *         schema:
             *           $ref: "#/definitions/MunicipalityDocument"
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
                handler: (req, res) => this.municipalityController.updateById(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/{id}:
             *   delete:
             *     tags:
             *       - Municipalities
             *     description: Delete municipality by its id. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the municipality to delete
             *     responses:
             *       200:
             *         description: Deleted municipality
             *         schema:
             *           $ref: "#/definitions/MunicipalityDocument"
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
                handler: (req, res) => this.municipalityController.deleteById(req, res)
            }
        ]);
    }

}
