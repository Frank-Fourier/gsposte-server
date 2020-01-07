import { RequestMethod, Route } from "./Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { UserController } from "../controllers/UserController";

@provide(UserRoute)
export class UserRoute extends Route {

    constructor(
        @inject(UserController) private userController: UserController
    ) {
        super("/user", [
            /**
             * @swagger
             *
             * /user/register:
             *   post:
             *     tags:
             *       - Users
             *     description: Register a new user
             *     produces:
             *       - application/json
             *     parameters:
             *       - name: User
             *         description: User to register
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/User"
             *     security:
             *       - JWT: []
             *     responses:
             *       201:
             *         description: User created
             *         schema:
             *           $ref: "#/definitions/UserDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       409:
             *         description: Email must be unique
             */
            {
                subPath: "/register",
                method: RequestMethod.POST,
                requiresAuth: true,
                requiresAdmin: true,
                handler: (req, res) => this.userController.register(req, res)
            },
            /**
             * @swagger
             *
             * /user/update/password:
             *   put:
             *     tags:
             *       - Users
             *     description: Update user password
             *     produces:
             *       - application/json
             *     parameters:
             *       - name: Password update model
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/UserPasswordUpdate"
             *     security:
             *       - JWT: []
             *     responses:
             *       200:
             *         description: Password updated successfully
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                subPath: "/update/password",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.userController.updatePassword(req, res)
            }
        ])
    }

}
