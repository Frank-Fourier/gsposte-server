import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { NoticeController } from "@controllers/NoticeController";

@provide(NoticeRoute)
export class NoticeRoute extends Route {

    constructor(@inject(NoticeController) private noticeController: NoticeController) {
        super("/notice", [
            /**
             * @swagger
             *
             * /notice:
             *   post:
             *     tags:
             *       - Notices
             *     description: Creates a new unread notice associated to a user (or broadcast). Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: Notice to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/Notice"
             *     responses:
             *       201:
             *         description: Notice created correctly
             *         schema:
             *           $ref: "#/definitions/NoticeDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.noticeController.create(req, res)
            },
            /**
             * @swagger
             *
             * /notice/query:
             *   post:
             *     tags:
             *       - Notices
             *     description: Find notices associated with the user requesting. If admin, it ignores the association, you can find all of them.
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
                handler: (req, res) => this.noticeController.find(req, res)
            },
            /**
             * @swagger
             *
             * /notice/{id}:
             *   get:
             *     tags:
             *       - Notices
             *     description: Find notice by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the notice to find
             *     responses:
             *       200:
             *         description: Notice found
             *         schema:
             *           $ref: "#/definitions/NoticeDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to get info about recipients of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.noticeController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /notice/read/{id}:
             *   put:
             *     tags:
             *       - Notices
             *     description: Mark notice as read by its id.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the notice to mark as read
             *     responses:
             *       200:
             *         description: Notice marked as read
             *         schema:
             *           $ref: "#/definitions/NoticeDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/read/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.noticeController.read(req, res)
            },
            /**
             * @swagger
             *
             * /notice/{id}:
             *   delete:
             *     tags:
             *       - Notices
             *     description: Delete notice by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the notice to delete
             *     responses:
             *       200:
             *         description: Deleted notice
             *         schema:
             *           $ref: "#/definitions/NoticeDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         description: You are not allowed to delete notices of other users!
             */
            {
                path: "/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.noticeController.deleteById(req, res)
            }
        ]);
    }

}
