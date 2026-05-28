import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { MunicipalityController } from "@controllers/MunicipalityController";
import { jsonUploader } from "@services/MunicipalityService";

@provide(MunicipalityRoute)
export class MunicipalityRoute extends Route {

    @inject(MunicipalityController) private municipalityController: MunicipalityController;

    constructor() {
        super("/municipality", [
            /**
             * @swagger
             *
             * /municipality:
             *   post:
             *     tags:
             *       - Municipalities
             *     description: Create a new municipality. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: Model
             *         description: Municipality to create
             *         required: true
             *         in: body
             *         schema:
             *           $ref: "#/definitions/Municipality"
             *     responses:
             *       201:
             *         description: Municipality created correctly
             *         schema:
             *           $ref: "#/definitions/MunicipalityDocument"
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
                handler: (req, res) => this.municipalityController.create(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/import:
             *   post:
             *     tags:
             *       - Municipalities
             *     description: Import municipalities from JSON file. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: file
             *         description: JSON file containing municipalities to import. **MUST BE TAKEN FROM https://github.com/matteocontrini/comuni-json**
             *         required: true
             *         in: formData
             *         type: file
             *     responses:
             *       201:
             *         description: Municipalities imported correctly
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                path: "/import",
                method: RequestMethod.POST,
                requiresAuth: true,
                middlewares: [ jsonUploader ],
                handler: (req, res) => this.municipalityController.importFromJson(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/query:
             *   post:
             *     tags:
             *       - Municipalities
             *     description: Find municipalities with a query and pagination options.
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
                handler: (req, res) => this.municipalityController.find(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/search:
             *   get:
             *     tags:
             *       - Municipalities
             *     description: Autocomplete by municipality name (prefix-then-substring, case/accent insensitive).
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: q
             *         in: query
             *         required: true
             *         type: string
             *         description: Search prefix/substring on municipality name.
             *       - name: province
             *         in: query
             *         required: false
             *         type: string
             *         description: Filter by 2-letter province code (e.g. "MI").
             *       - name: limit
             *         in: query
             *         required: false
             *         type: integer
             *         description: Max results (default 20, max 50).
             *     responses:
             *       200:
             *         description: Array of matching municipalities
             *         schema:
             *           type: array
             *           items:
             *             $ref: "#/definitions/MunicipalityDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/search",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.municipalityController.search(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/by-zip/{zip}:
             *   get:
             *     tags:
             *       - Municipalities
             *     description: Lookup municipalities by exact CAP. Includes hamlets (frazioni) with their own CAP.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: zip
             *         in: path
             *         required: true
             *         type: string
             *         description: 5-digit CAP.
             *     responses:
             *       200:
             *         description: Municipalities and hamlets that match this CAP
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/by-zip/:zip",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.municipalityController.findByZip(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/by-istat/{istat}:
             *   get:
             *     tags:
             *       - Municipalities
             *     description: Lookup a municipality by exact ISTAT code (logical key).
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: istat
             *         in: path
             *         required: true
             *         type: string
             *     responses:
             *       200:
             *         description: Municipality found
             *         schema:
             *           $ref: "#/definitions/MunicipalityDocument"
             *       404:
             *         description: ISTAT not found
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/by-istat/:istat",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.municipalityController.findByIstat(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/validate:
             *   post:
             *     tags:
             *       - Municipalities
             *     description: >
             *       Address validation core. Accepts {city, zip, province?} and returns
             *       { ok, normalized?, errors[], suggestions[] } so the frontend can
             *       offer correction tips before submitting a letter / saving an anagrafica.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: body
             *         in: body
             *         required: true
             *         schema:
             *           type: object
             *           required: [ city, zip ]
             *           properties:
             *             city:     { type: string, example: "Roma" }
             *             zip:      { type: string, example: "00118" }
             *             province: { type: string, example: "RM" }
             *     responses:
             *       200:
             *         description: Validation result (ok=true|false)
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/validate",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.municipalityController.validate(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/{id}:
             *   get:
             *     tags:
             *       - Municipalities
             *     description: Find a municipality by id.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the municipality to find
             *     responses:
             *       200:
             *         description: Municipality found
             *         schema:
             *           $ref: "#/definitions/MunicipalityDocument"
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             */
            {
                path: "/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.municipalityController.findById(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/{id}:
             *   put:
             *     tags:
             *       - Municipalities
             *     description: Update municipality by its id. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the municipality to update
             *       - name: Update body
             *         required: true
             *         in: body
             *         description: Update body following the Municipality model
             *     responses:
             *       200:
             *         description: Updated municipality
             *         schema:
             *           $ref: "#/definitions/MunicipalityDocument"
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
                handler: (req, res) => this.municipalityController.updateById(req, res)
            },
            /**
             * @swagger
             *
             * /municipality/{id}:
             *   delete:
             *     tags:
             *       - Municipalities
             *     description: Delete municipality by its id. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the municipality to delete
             *     responses:
             *       200:
             *         description: Deleted municipality
             *         schema:
             *           $ref: "#/definitions/MunicipalityDocument"
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
                handler: (req, res) => this.municipalityController.deleteById(req, res)
            }
        ]);
    }

}
