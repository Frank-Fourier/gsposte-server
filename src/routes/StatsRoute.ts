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
             * /stats/{id}:
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
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.statsController.fetchStatsForUser(req, res)
            }
        ]);
    }

}
