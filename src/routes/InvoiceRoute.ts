import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { InvoiceController } from "@controllers/InvoiceController";

@provide(InvoiceRoute)
export class InvoiceRoute extends Route {

    constructor(@inject(InvoiceController) private invoiceController: InvoiceController) {
        super("/invoice", [
            /**
             * @swagger
             *
             * /invoice/user/{id}:
             *   post:
             *     tags:
             *       - Invoices
             *     description: Generate invoices for a specific user aggregating by letters not yet paid with the same sender. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the user to generate invoices for
             *     responses:
             *       201:
             *         description: Invoice creation results (document + errors)
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                path: "/user/:id",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.invoiceController.generateInvoicesForUser(req, res)
            },
            /**
             * @swagger
             *
             * /invoice/global:
             *   post:
             *     tags:
             *       - Invoices
             *     description: Generates invoices for every user. Only admins can do this!
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     responses:
             *       201:
             *         description: Returns invoices as key-value pairs where the key is the user id and the value is the array of invoice creation results.
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                path: "/global",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.invoiceController.generateInvoices(req, res)
            },
            /**
             * @swagger
             *
             * /invoice/single:
             *   post:
             *     tags:
             *       - Invoices
             *     description: Generate a single invoice for a specific set of letters that share the same sender.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: body
             *         description: Array of letter ids
             *     responses:
             *       201:
             *         description: Invoice created and saved. Returns the invoice document.
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                path: "/single",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.invoiceController.generateSingleInvoice(req, res)
            },
            /**
             * @swagger
             *
             * /invoice/pay/{id}:
             *   post:
             *     tags:
             *       - Invoices
             *     description: Marks an invoice as paid. It will also mark as paid all of its associated letters.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the invoice to pay
             *     responses:
             *       201:
             *         description: Invoice document updated
             *       400:
             *         $ref: "#/responses/BadRequest"
             *       401:
             *         $ref: "#/responses/Unauthorized"
             *       403:
             *         $ref: "#/responses/Forbidden"
             */
            {
                path: "/pay/:id",
                method: RequestMethod.POST,
                requiresAuth: true,
                handler: (req, res) => this.invoiceController.markInvoiceAsPaid(req, res)
            },
            /**
             * @swagger
             *
             * /invoice/query:
             *   post:
             *     tags:
             *       - Invoices
             *     description: Find invoices associated with the user requesting. If admin, it ignores the association, you can find all of them.
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
                handler: (req, res) => this.invoiceController.find(req, res)
            },
            /**
             * @swagger
             *
             * /invoice/{id}:
             *   get:
             *     tags:
             *       - Invoices
             *     description: Find invoice by its id, associated with the user requesting. If admin, it ignores the association.
             *     produces:
             *       - application/json
             *     security:
             *       - JWT: []
             *     parameters:
             *       - name: id
             *         required: true
             *         in: path
             *         description: Mongo id of the invoice to find
             *     responses:
             *       201:
             *         description: Invoices created and saved
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
                handler: (req, res) => this.invoiceController.findById(req, res)
            },
        ]);
    }

}
