import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { StatsController } from "@controllers/StatsController";

@provide(StatsRoute)
export class StatsRoute extends Route {

    constructor(@inject(StatsController) private statsController: StatsController) {
        super("/stats", [
            /**
             * @swagger
             *
             * /stats/user/{id}/{year}:
             *   get:
             *     tags:
             *       - Stats
             *     description: Fetch stats for the user id passed on path. If admin, you can get stats for other users.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the user to get stats for
             *       - name: year
             *         required: false
             *         in: path
             *         description: Optional year to get the stats for. If omitted, it considers ALL the letters sent by this user
             *       - name: gte
             *         required: false
             *         in: query
             *         description: Optional GTE value for sendAt. Considered if year is not passed
             *       - name: lte
             *         required: false
             *         in: query
             *         description: Optional LTE value for sendAt. Considered if year is not passed
             *     responses:
             *       200:
             *         description: Stats
             *         schema:
             *           $ref: "#/definitions/Stats"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to get statistics of other users!
             */
            {
                path: "/user/:id/:year",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.statsController.fetchStatsForUser(req, res)
            },
            /**
             * @swagger
             *
             * /stats/system/{year}:
             *   get:
             *     tags:
             *       - Stats
             *     description: Fetch total system spent stats. This refers to prices directly outgoing to Poste Italiane. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: year
             *         required: false
             *         in: path
             *         description: Optional year to get the stats for. If omitted, it considers ALL the letters sent
             *     responses:
             *       200:
             *         description: System spent stats
             *         schema:
             *           $ref: "#/definitions/SystemSpentStats"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to access this data
             */
            {
                path: "/system/:year",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.statsController.fetchSystemSpentStats(req, res)
            },
        ]);
    }

}
