import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PriceController } from "@controllers/PriceController";

@provide(PriceRoute)
export class PriceRoute extends Route {

    @inject(PriceController) private priceController: PriceController;

    constructor() {
        super("/price", [
            /**
             * @swagger
             *
             * /price:
             *   post:
             *     tags:
             *       - Prices
             *     description: Create a new price. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: Price to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/Price"
             *     responses:
             *       201:
             *         description: Price created correctly
             *         schema:
             *           $ref: "#/definitions/PriceDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.priceController.create(req, res)
            },
            /**
             * @swagger
             *
             * /price/query:
             *   post:
             *     tags:
             *       - Prices
             *     description: Find prices with query and pagination options
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
                handler: (req, res) => this.priceController.find(req, res)
            },
            /**
             * @swagger
             *
             * /price/{id}:
             *   get:
             *     tags:
             *       - Prices
             *     description: Find a price by id.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the price to find
             *     responses:
             *       200:
             *         description: Price found
             *         schema:
             *           $ref: "#/definitions/PriceDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to get info about prices of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.priceController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /price/{id}:
             *   put:
             *     tags:
             *       - Prices
             *     description: Update price by its id. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the price to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the Price model
             *     responses:
             *       200:
             *         description: Updated price
             *         schema:
             *           $ref: "#/definitions/PriceDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to update prices of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.priceController.updateById(req, res)
            },
            /**
             * @swagger
             *
             * /price/{id}:
             *   delete:
             *     tags:
             *       - Prices
             *     description: Delete price by its id. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the price to delete
             *     responses:
             *       200:
             *         description: Deleted price
             *         schema:
             *           $ref: "#/definitions/PriceDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to delete prices of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.priceController.deleteById(req, res)
            }
        ])
    }

}
