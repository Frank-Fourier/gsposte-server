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
             * /user:
             *   post:
             *     tags:
             *       - Users
             *     description: Creates a new user. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
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
             *       403:
             *         $ref: "#/responses/Forbidden"
             *       409:
             *         description: Email and username must be unique
             */
            {
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.userController.create(req, res)
            },
            /**
             * @swagger
             *
             * /user/query:
             *   post:
             *     tags:
             *       - Users
             *     description: Find users with a query and pagination options. Only admins can do this!
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
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                path: "/query",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.userController.find(req, res)
            },
            /**
             * @swagger
             *
             * /user/{id}:
             *   get:
             *     tags:
             *       - Users
             *     description: Find an user by id. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the user to find
             *     responses:
             *       200:
             *         description: User found
             *         schema:
             *           $ref: "#/definitions/UserDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.userController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /user/{id}:
             *   put:
             *     tags:
             *       - Users
             *     description: Update an user by its id. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the user to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the User model
             *     responses:
             *       200:
             *         description: Updated user
             *         schema:
             *           $ref: "#/definitions/UserDocument"
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
                handler: (req, res) => this.userController.updateById(req, res)
            },
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
             * /user/update/me:
             *   put:
             *     tags:
             *       - Users
             *     description: Update an user based on who is making the request (token)
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the User model **(don't include password!)**
             *     responses:
             *       200:
             *         description: Updated user
             *         schema:
             *           $ref: "#/definitions/UserDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/update/me",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.userController.updateMe(req, res)
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
            },
            /**
             * @swagger
             *
             * /user/{id}:
             *   delete:
             *     tags:
             *       - Users
             *     description: Delete an user by its id. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the user to delete
             *     responses:
             *       200:
             *         description: Deleted user
             *         schema:
             *           $ref: "#/definitions/UserDocument"
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
                handler: (req, res) => this.userController.deleteById(req, res)
            }
        ])
    }

}
