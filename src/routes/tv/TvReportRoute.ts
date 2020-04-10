import { RequestMethod, Route } from "@routes/Route";
import { inject } from "inversify";
import { TvReportController } from "@controllers/tv/TvReportController";

export class TvReportRoute extends Route {

    constructor(@inject(TvReportController) private tvReportController: TvReportController) {
        super("/tv/report", [
            /**
             * @swagger
             *
             * /tv/report:
             *   post:
             *     tags:
             *       - TV Reports
             *     description: Create a new TV report. Only TV managers (and admins) can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: TV report to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/TvReport"
             *     responses:
             *       201:
             *         description: TV report created correctly
             *         schema:
             *           $ref: "#/definitions/TvReportDocument"
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
                handler: (req, res) => this.tvReportController.create(req, res)
            },
            /**
             * @swagger
             *
             * /tv/report/query:
             *   post:
             *     tags:
             *       - TV Reports
             *     description: Find TV reports with a query and pagination options. Only TV managers (and admins) can do this!
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
                handler: (req, res) => this.tvReportController.find(req, res)
            },
            /**
             * @swagger
             *
             * /tv/report/fetch:
             *   post:
             *     tags:
             *       - TV Reports
             *     description: Find TV reports with a query and pagination options for a requesting TV user. Only TV users with a valid TV JWT token can do this!
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
                path: "/fetch",
                method: RequestMethod.POST,
                requiresAuth: true,
                authStrategy: "jwt_tv",
                handler: (req, res) => this.tvReportController.fetch(req, res)
            },
            /**
             * @swagger
             *
             * /tv/report/attachment/upload:
             *   post:
             *     tags:
             *       - TV Reports
             *     description: Upload a new TV report attachment file. Only TV managers (and admins) can do this!
             *     consumes:
             *       - multipart/form-data
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: file
             *         description: File to upload. Max file size allowed is 100MB. No mime-type restrictions.
             *         required: true
             *         in: formData
             *         type: file
             *     responses:
             *       201:
             *         description: Attachment uploaded correctly, returns its filename
             *       400:
             *         description: More than one file was passed to the request, or generic error while uploading.
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       413:
             *         description: The provided file is too heavy. Only file sizes < 100MB are acceptable for upload.
             */
            {
                path: "/attachment/upload",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.tvReportController.upload(req, res)
            },
            /**
             * @swagger
             *
             * /tv/report/{id}:
             *   get:
             *     tags:
             *       - TV Reports
             *     description: Find a TV report by id. Only TV managers (and admins) can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the TV report to find
             *     responses:
             *       200:
             *         description: TV report found
             *         schema:
             *           $ref: "#/definitions/TvReportDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.tvReportController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /tv/report/fetch/{id}:
             *   get:
             *     tags:
             *       - TV Reports
             *     description: Find TV report by id for a requesting TV user. Only TV users with a valid TV JWT token can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the TV report to find
             *     responses:
             *       200:
             *         description: TV report found
             *         schema:
             *           $ref: "#/definitions/TvReportDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/fetch/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                authStrategy: "jwt_tv",
                handler: (req, res) => this.tvReportController.fetchById(req, res)
            },
            /**
             * @swagger
             *
             * /tv/report/{id}:
             *   put:
             *     tags:
             *       - TV Reports
             *     description: Update TV report by its id. Only TV managers (and admins) can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the TV report to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the TV report model
             *     responses:
             *       200:
             *         description: Updated TV report
             *         schema:
             *           $ref: "#/definitions/TvReportDocument"
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
                handler: (req, res) => this.tvReportController.updateById(req, res)
            },
            /**
             * @swagger
             *
             * /tv/report/{id}:
             *   delete:
             *     tags:
             *       - TV Reports
             *     description: Delete TV report by its id. Only TV managers (and admins) can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the TV report to delete
             *     responses:
             *       200:
             *         description: Deleted TV report
             *         schema:
             *           $ref: "#/definitions/TvReportDocument"
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
                handler: (req, res) => this.tvReportController.deleteById(req, res)
            },
        ]);
    }

}
