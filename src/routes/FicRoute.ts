import { RequestMethod, Route } from "./Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { FicController } from "@controllers/FicController";

@provide(FicRoute)
export class FicRoute extends Route {

    @inject(FicController) private ficController: FicController;

    constructor() {
        super("/fic", [

            /**
             * @swagger
             *
             * /fic/oauth/verify:
             *   post:
             *     tags:
             *       - Fic
             *     description: Verify Token with responseUrl
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     responses:
             *       201:
             *         description: Token created
             *         schema:
             *           $ref: "#/definitions/FicTokenResponse"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/oauth/verify",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.ficController.getFicToken(req, res)
            }
        ]);
    }
}
