import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { RevenueShareController } from "@controllers/RevenueShareController";

/**
 * Tutti gli endpoint sotto /revenue-share sono admin-only (controllo nel controller).
 * Path:
 *   /revenue-share/global                          GET, PUT
 *   /revenue-share/invoice/:id/preview             GET
 *   /revenue-share/report/payouts                  GET (query ?from=YYYY-MM-DD&to=YYYY-MM-DD)
 *   /revenue-share/report/payouts/export           GET (stesso range, restituisce xlsx)
 *
 * Non esistono più endpoint di override per Sender / User / Invoice: la admin fee
 * è SEMPRE accreditata al User che ha emesso la fattura (invoice.user) usando
 * i dati `payoutFiscalCode` / `payoutIban` del suo profilo + `User.adminFeePercent`
 * come eventuale override personale della % rispetto al default globale.
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
             *     description: Get the global RevenueShareSetting singleton.
             *     security: [ { JWT: [] } ]
             *     responses:
             *       200:
             *         description: Setting singleton
             *         schema: { $ref: "#/definitions/RevenueShareSetting" }
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
             *     description: |
             *       Aggiorna il singleton globale. Almeno uno tra `adminFeePercent` e
             *       `residualBeneficiaries` deve essere presente. Valida che le %
             *       dei residuali sommino a ~100 (±0.10 di tolleranza).
             *     security: [ { JWT: [] } ]
             *     parameters:
             *       - name: body
             *         in: body
             *         required: true
             *         schema:
             *           type: object
             *           properties:
             *             adminFeePercent:
             *               type: number
             *             residualBeneficiaries:
             *               type: array
             *               minItems: 2
             *               maxItems: 2
             *               items: { $ref: "#/definitions/ResidualBeneficiary" }
             *     responses:
             *       200: { description: Updated singleton }
             *       400: { $ref: "#/responses/BadRequest" }
             */
            {
                path: "/global",
                method: RequestMethod.PUT,
                requiresAuth: true,
                handler: (req, res) => this.controller.updateGlobal(req, res),
            },
            /**
             * @swagger
             *
             * /revenue-share/invoice/{id}/preview:
             *   get:
             *     tags: [ "Revenue Share" ]
             *     description: |
             *       Anteprima dello split per una invoice senza modificare nulla.
             *       Se la invoice ha già `splitSnapshot`, ritorna quello (immutabile).
             *     security: [ { JWT: [] } ]
             *     parameters:
             *       - name: id
             *         in: path
             *         required: true
             *         type: string
             *     responses:
             *       200: { description: Resolved split }
             */
            {
                path: "/invoice/:id/preview",
                method: RequestMethod.GET,
                requiresAuth: true,
                handler: (req, res) => this.controller.previewInvoiceSplit(req, res),
            },
            /**
             * @swagger
             *
             * /revenue-share/report/payouts:
             *   get:
             *     tags: [ "Revenue Share" ]
             *     description: |
             *       Aggrega tutti i payout (snapshot di fatture paid) in un range di
             *       date, separati per amministratori (admin fee) e beneficiari residuo.
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
             *     description: Stesso payoutReport ma serializzato come xlsx (2 fogli).
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
