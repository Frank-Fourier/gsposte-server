import { RequestMethod, Route } from "./Route";
import { provide } from "inversify-binding-decorators";
import { UserController } from "@controllers/UserController";
import { inject } from "inversify";

@provide(UserRoute)
export class UserRoute extends Route {

    @inject(UserController) private userController: UserController;

    constructor() {
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
             *     responses:
             *       201:
             *         description: User created (password will be encrypted)
             *         schema:
             *           $ref: "#/definitions/UserDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       409:
             *         description: Email and username must be unique
             */
            {
                path: "/register",
                method: RequestMethod.POST,
                requiresAuth: false,
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
                path: "/update/password",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.userController.updatePassword(req, res)
            },
            /**
             * @swagger
             *
             * /user/activate/{id}:
             *   put:
             *     tags:
             *       - Users
             *     description: Activate an user by id. Only admins can do this!
             *     produces:
             *       - application/json
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         type: string
             *     security:
             *       - JWT: []
             *     responses:
             *       200:
             *         description: User was activated
             *         schema:
             *           $ref: "#/definitions/UserDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/activate/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.userController.activate(req, res)
            }
        ])
    }

}
