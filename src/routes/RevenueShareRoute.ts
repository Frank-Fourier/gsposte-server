import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { RevenueShareController } from "@controllers/RevenueShareController";

/**
 * Tutti gli endpoint sotto /revenue-share sono admin-only (controllo nel controller).
 * Path principali:
 *   /revenue-share/global                          GET, PUT
 *   /revenue-share/sender/:id                      GET, PUT, DELETE
 *   /revenue-share/user/:id                        GET, PUT, DELETE
 *   /revenue-share/invoice/:id                     GET, PUT, DELETE
 *   /revenue-share/invoice/:id/preview             GET
 *   /revenue-share/report/payouts                  GET (query ?from=YYYY-MM-DD&to=YYYY-MM-DD)
 *   /revenue-share/report/payouts/export           GET (stesso range, restituisce xlsx)
 */
@provide(RevenueShareRoute)
export class RevenueShareRoute extends Route {

    constructor(@inject(RevenueShareController) private controller: RevenueShareController) {
        super("/revenue-share", [
            /**
             * @swagger
             *
             * /revenue-share/global:
             *   get:
             *     tags: [ "Revenue Share" ]
             *     description: Get the global RevenueShareSetting singleton (default split percentages and beneficiaries).
             *     security: [ { JWT: [] } ]
             *     responses:
             *       200:
             *         description: Setting singleton
             *         schema: { $ref: "#/definitions/RevenueShareSetting" }
             *       401: { $ref: "#/responses/Unauthorized" }
             *       403: { $ref: "#/responses/Forbidden" }
             */
            {
                path: "/global",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.controller.getGlobal(req, res),
            },
            /**
             * @swagger
             *
             * /revenue-share/global:
             *   put:
             *     tags: [ "Revenue Share" ]
             *     description: Update beneficiaries on the global singleton. Validates that percentages sum to ~100 (±0.10 tolerance).
             *     security: [ { JWT: [] } ]
             *     parameters:
             *       - name: body
             *         in: body
             *         required: true
             *         schema:
             *           type: object
             *           properties:
             *             beneficiaries:
             *               type: array
             *               items: { $ref: "#/definitions/RevenueShareBeneficiary" }
             *     responses:
             *       200: { description: Updated singleton }
             *       400: { $ref: "#/responses/BadRequest" }
             *       401: { $ref: "#/responses/Unauthorized" }
             *       403: { $ref: "#/responses/Forbidden" }
             */
            {
                path: "/global",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.controller.updateGlobal(req, res),
            },

            // ─── Sender override ────────────────────────────────────────
            {
                path: "/sender/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.controller.getSenderOverride(req, res),
            },
            {
                path: "/sender/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.controller.setSenderOverride(req, res),
            },
            {
                path: "/sender/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.controller.deleteSenderOverride(req, res),
            },

            // ─── User override ──────────────────────────────────────────
            {
                path: "/user/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.controller.getUserOverride(req, res),
            },
            {
                path: "/user/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.controller.setUserOverride(req, res),
            },
            {
                path: "/user/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.controller.deleteUserOverride(req, res),
            },

            // ─── Invoice override (solo se !paid) ───────────────────────
            {
                path: "/invoice/:id",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.controller.getInvoiceOverride(req, res),
            },
            {
                path: "/invoice/:id",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.controller.setInvoiceOverride(req, res),
            },
            {
                path: "/invoice/:id",
                method: RequestMethod.DELETE,
                requiresAuth: true,
                handler: (req, res) => this.controller.deleteInvoiceOverride(req, res),
            },
            /**
             * @swagger
             *
             * /revenue-share/invoice/{id}/preview:
             *   get:
             *     tags: [ "Revenue Share" ]
             *     description: Anteprima dello split che verrebbe applicato a una invoice senza modificare nulla. Se invoice ha già splitSnapshot, ritorna quello.
             *     security: [ { JWT: [] } ]
             *     parameters:
             *       - name: id
             *         in: path
             *         required: true
             *         type: string
             *     responses:
             *       200: { description: Resolved split }
             *       401: { $ref: "#/responses/Unauthorized" }
             *       403: { $ref: "#/responses/Forbidden" }
             */
            {
                path: "/invoice/:id/preview",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.controller.previewInvoiceSplit(req, res),
            },

            // ─── Reports ────────────────────────────────────────────────
            /**
             * @swagger
             *
             * /revenue-share/report/payouts:
             *   get:
             *     tags: [ "Revenue Share" ]
             *     description: Aggrega tutti i payout (snapshot di fatture paid) in un range di date.
             *     security: [ { JWT: [] } ]
             *     parameters:
             *       - name: from
             *         in: query
             *         required: true
             *         type: string
             *         description: YYYY-MM-DD
             *       - name: to
             *         in: query
             *         required: true
             *         type: string
             *         description: YYYY-MM-DD
             *     responses:
             *       200: { description: Payout report JSON }
             */
            {
                path: "/report/payouts",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.controller.payoutReport(req, res),
            },
            /**
             * @swagger
             *
             * /revenue-share/report/payouts/export:
             *   get:
             *     tags: [ "Revenue Share" ]
             *     description: Stesso payoutReport ma serializzato come xlsx (2 fogli: Riepilogo + Dettaglio).
             *     security: [ { JWT: [] } ]
             *     parameters:
             *       - name: from
             *         in: query
             *         required: true
             *         type: string
             *       - name: to
             *         in: query
             *         required: true
             *         type: string
             *     produces:
             *       - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
             *     responses:
             *       200: { description: xlsx file }
             */
            {
                path: "/report/payouts/export",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.controller.payoutReportXlsx(req, res),
            },
        ]);
    }

}
