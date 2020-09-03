import { RequestMethod, Route } from "@routes/Route";
import { inject } from "inversify";
import { ProvisionController } from "@controllers/ProvisionController";

export class ProvisionRoute extends Route {

    @inject(ProvisionController) private provisionController: ProvisionController;

    constructor() {
        super("/provision", [
            /**
             * @swagger
             *
             * /provision/generate/{letterId}:
             *   post:
             *     tags:
             *       - Provisions
             *     description: Generate a provision for a letter if not already generated
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: letterId
             *         required: true
             *         in: path
             *         description: Mongo id of the letter to calculate provision of
             *     responses:
             *       201:
             *         description: Provision generated correctly
             *         schema:
             *           $ref: "#/definitions/ProvisionDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/generate/:letterId",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.provisionController.generate(req, res)
            },
            /**
             * @swagger
             *
             * /provision/query:
             *   post:
             *     tags:
             *       - Provisions
             *     description: Find provisions with query and pagination options
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
                handler: (req, res) => this.provisionController.find(req, res)
            },
            /**
             * @swagger
             *
             * /provision/revenue/{userId}:
             *   get:
             *     tags:
             *       - Provisions
             *     description: Calculate user's revenue
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: userId
             *         required: true
             *         in: path
             *         description: Mongo id of the user to calculate revenue of
             *     responses:
             *       200:
             *         description: Calculated revenue for the user
             *         schema:
             *           type: object
             *           properties:
             *             revenue:
             *               type: number
             *               example: 70
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/revenue/:userId",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.provisionController.calculateRevenue(req, res)
            },
            /**
             * @swagger
             *
             * /provision/revenue/monthly/{userId}:
             *   get:
             *     tags:
             *       - Provisions
             *     description: Aggregates monthly revenues for a user
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: userId
             *         required: true
             *         in: path
             *         description: Mongo id of the user to aggregate revenues of
             *     responses:
             *       200:
             *         description: Aggregated monthly revenues for a user
             *         schema:
             *           $ref: "#/definitions/RevenueMonths"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/revenue/monthly/:userId",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.provisionController.calculateRevenuesMonthly(req, res)
            },
        ]);
    }

}
