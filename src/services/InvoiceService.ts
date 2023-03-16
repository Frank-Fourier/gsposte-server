import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PDF_ROOT, PdfService } from "@services/PdfService";
import { LetterDocument } from "@models/LetterModel";
import { SenderDocument } from "@models/SenderModel";
import { Invoice, invoiceDecoder, InvoiceDocument, InvoiceModel } from "@models/InvoiceModel";
import { PriceService } from "@services/PriceService";
import { LetterService } from "@services/LetterService";
import { UserService } from "@services/UserService";
import { compileFile } from "pug";
import { Document } from "mongoose";
import { MongoRepository } from "@services/MongoRepository";
import httpErrors from "http-errors";
import { createLogFile, logger } from "@utils/winston";
import { formatCurrency, groupBy, insert } from "@utils/misc";
import moment from "moment";
import fs from "fs";
import { sleep } from "@utils/sleep";
import { UserDocument } from "@models/UserModel";
import { ws_message } from "@utils/websockets";
import { NoticeKind } from "@models/NoticeModel";
import { NoticeService } from "@services/NoticeService";
import { RecipientDocument } from "@models/RecipientModel";
import { authorizeOAuth2, callFicApi, findOauthRequest } from "@services/FicService";
import { AuthorizeOAuth2ClientRequest, FicMessage, FicRequest } from "@models/FicModel";
import {
    CreateIssuedDocumentRequest,
    IssuedDocument,
    IssuedDocumentStatus,
    IssuedDocumentType,
    PaymentAccount,
    ShowTotalsMode,
    VatKind
} from "@fattureincloud/fattureincloud-ts-sdk";
import process from "process";

export const INVOICES_ROOT = process.env.INVOICES_ROOT || "public/invoices";
export interface InvoiceBulkExportResponse {
    exported: Array<InvoiceDocument>
    errors: Array<{ invoice: InvoiceDocument, error: any }>
}
export interface ExportFlags {
    exporting: boolean
    exported: number
    to_export: number
    progress: number
}

@provide(InvoiceService)
export class InvoiceService extends MongoRepository<Invoice, InvoiceDocument> {

    @inject(PdfService) private pdf: PdfService;
    @inject(PriceService) private priceService: PriceService;
    @inject(UserService) private userService: UserService;
    @inject(LetterService) private letterService: LetterService;
    @inject(NoticeService) private noticeService: NoticeService;

    private exportFlags: ExportFlags = {
        exporting: false,
        exported: 0,
        to_export: 0,
        progress: 0,
    }

    constructor(private invoiceModel = InvoiceModel) {
        super(invoiceModel, invoiceDecoder, [ "userName", "senderName", "senderBusinessName" ]);
    }

    public async deleteById(id: string): Promise<InvoiceDocument> {
        const invoice = await this.findById(id, { populate: "letters" });
        for (const letter of invoice.letters as Array<LetterDocument>) {
            await letter.updateOne({ $unset: { invoice: "" } });
        }
        return super.deleteById(id);
    }

    /**
     * Generate an invoice for a set of letters. The letters array must not be empty,
     * and all the letters must have the same sender.
     *
     * @param letters {Array<LetterDocument>} Letters to generate an invoice from
     * @param number {number} Invoice number
     * @returns Promise resolving to the invoice created and any errors that occured during the process
     */
    public async generateSingleInvoice(letters: Array<LetterDocument>, number: number): Promise<{
        invoice: InvoiceDocument,
        errors: Array<{ letter: LetterDocument, error: Error | any }>
    }> {
        if (letters.length === 0) {
            throw new httpErrors.BadRequest("Non è presente alcuna lettera per cui generare fattura.");
        }

        const errors: Array<{ letter: LetterDocument, error: Error | any }> = [];
        let taxableSum = 0, giftSum = 0;

        for (const letter of letters) {
            letter.depopulate("sender user");
            if (letter.sender.toString() !== letters[0].sender.toString()) {
                throw new httpErrors.BadRequest("Le lettere per cui generare fattura devono avere tutte lo stesso mittente.");
            }

            try {
                if (!letter.sent) {
                    throw new httpErrors.BadRequest("Questa lettera non è inviata, quindi non sarà inclusa in fattura.");
                }
                if (letter.error) {
                    throw new httpErrors.BadRequest("Questa lettera non è stata inviata a causa di un errore, quindi non sarà inclusa in fattura.");
                }

                const taxable = letter.getTotalPrice();
                if (taxable <= 0 || isNaN(taxable)) {
                    throw new httpErrors.BadRequest("Questa lettera non ha un prezzo associato, quindi non è possibile includerla in fattura.");
                }

                taxableSum += taxable + await this.priceService.calculatePriceSMS(letter);
                giftSum += letter.recipientsGift ?? 0;
            } catch (err) {
                errors.push({ letter: letter, error: err });
            }
        }

        const taxableMinusGifts = taxableSum - giftSum;
        const iva = (taxableMinusGifts * 22) / 100;
        const granTotal = taxableMinusGifts + iva;
        if (granTotal <= 0) {
            // Return prematurely: this invoice has no value
            return {
                invoice: null,
                errors: []
            }
        }

        const invoice = await this.save({
            user: letters[0].user,
            sender: letters[0].sender,
            letters: letters.filter(l => l.sent),
            taxable: parseFloat(taxableSum.toFixed(2)),
            discount: parseFloat(giftSum.toFixed(2)),
            iva: parseFloat(iva.toFixed(2)),
            total: parseFloat(granTotal.toFixed(2)),
        });

        if (!!number) {
            invoice.number = number;
            await invoice.save();
        }

        for (const letter of letters) {
            await letter.updateOne({ $set: { invoice: invoice.id }}).exec();
        }

        return {
            invoice: invoice,
            errors: errors
        };
    }

    /**
     * Generate N invoices for a user, aggregating the letters not yet paid with the same senders.
     * Basically performs the aggregation and then calls the generateSingleInvoice function for each array.
     *
     * @param user {string} User id to search letters for
     * @param startNumber {number} Invoice number to start generation from
     * @param minTotal {number} Number min total to generate invoice for User
     * @returns Array of results of generateSingleInvoice, one for each letter
     */
    public async generateInvoicesForUser(user: string, startNumber?: number, minTotal?: number): Promise<Array<{
        invoice: InvoiceDocument,
        errors: Array<{ letter: LetterDocument, error: Error | any }>
    }>> {
        const letters = await this.letterService.find({
            user: user,
            sent: true,
            paid: { $ne: true },
            error: { $ne: true },
            invoice: { $exists: false },
        });
        if (!letters || letters.length === 0) {
            return [];
        }

        const aggregated = groupBy<LetterDocument>(letters, letter => letter.sender as string);
        const results: Array<{
            invoice: InvoiceDocument,
            errors: Array<{ letter: LetterDocument, error: Error | any }>
        }> = [];

        let lastNumber = startNumber ?? await this.getLatestInvoiceNumber();
        for (const letter of Object.values(aggregated)) {
            const result = await this.generateSingleInvoice(letter, lastNumber + 1);
            if (!result.invoice) {
                continue;
            }

            logger.debug(`Total of single invoice: ${result.invoice.total}`);
            results.push(result);
            lastNumber++;
        }

        const total = results.reduce((acc, cur) => acc + cur.invoice.total, 0);
        logger.debug(`Total: ${total}`);
        if (total < minTotal) {
            logger.debug(`${total} < ${minTotal}`);
            Promise.all(results.map(r => this.deleteById(r.invoice.id)));
            return [];
        }

        return results;
    }

    /**
     * The most generic flavor of generateSingleInvoice, generates all the possible invoices, for every single user!
     *
     * @param startNumber {number} Optional invoice number to start from
     * @param minTotal {number} Number min total to generate invoice for User
     * @returns Key-value where each key is the user id, and each value is the array of results
     */
    public async generateInvoices(startNumber?: number, minTotal?: number): Promise<{
        [key: string]: Array<{
            invoice: InvoiceDocument,
            errors: Array<{ letter: LetterDocument, error: Error | any }>
        }>
    }> {
        const users = await this.userService.findAll();
        const results: {
            [key: string]: Array<{
                invoice: InvoiceDocument,
                errors: Array<{ letter: LetterDocument, error: Error | any }>
            }>
        } = {};

        for (const user of users) {
            const res = await this.generateInvoicesForUser(user.id, startNumber, minTotal);
            if (res.length > 0) {
                results[user.id] = res;
            }
            if (!!startNumber) {
                startNumber += res.length;
            }
        }

        return results;
    }

    /**
     * Fetchs the latest invoice number from the latest created invoice in the database
     *
     * @returns {Promise<number>} Promise resolving to the latest invoice number
     */
    public async getLatestInvoiceNumber(): Promise<number> {
        // Filter invoices of this current year
        const year = new Date().getFullYear();
        const invoices = (await this.find({
            createdAt: {
                $gte: `${year}-01-01`,
                $lte: `${year}-12-31`
            }
        }, { sort: { "createdAt": -1 } }));
        if (!invoices || invoices.length === 0) {
            return 0;
        }

        return invoices[0].number;
    }

    /**
     * Toggle an invoice paid property. This means that its 'paid' property becomes true, as well as all the
     * 'paid' properties of the letters associated with this invoice. The viceversa is also true: if paid was true,
     * it will become false.
     *
     * @param invoice {InvoiceDocument} Invoice to toggle paid
     * @param requestParams {AuthorizeOAuth2ClientRequest} Fic v2 require param for connection
     * @returns {Promise<InvoiceDocument>} Promise resolving to the updated invoice document
     */
    public async toggleInvoicePaid(invoice: InvoiceDocument, requestParams?: AuthorizeOAuth2ClientRequest): Promise<InvoiceDocument> {
        invoice = await invoice.populate("letters").execPopulate();
        await Promise.all(
            invoice.letters.map((letter: LetterDocument) =>
                this.letterService.updateById((letter as LetterDocument).id, {
                    $set: { paid: !letter.paid }
                })
            )
        );
        const updated = await this.updateById(invoice.id, {
            $set: { paid: !invoice.paid, paymentDate: Date.now() }
        });

        if (!!updated.fic) {
            logger.info("Updating invoice on fic");
            // Check if fic token is present

            const oauthRequest = findOauthRequest(requestParams.authorization);
            if (!oauthRequest?.access || !oauthRequest?.apiConfig) {

                await this.updateById(invoice.id, {
                    $set: { paid: !updated.paid, paymentDate: undefined }
                });

                throw {
                    message: FicMessage.GET_AUTHORIZATION_URL,
                    ficAuthorizationUri: authorizeOAuth2(requestParams)
                };
            }

            const payments_list = (await  callFicApi(FicRequest.GET_LIST_PAYMENT_METHODS, oauthRequest)) as PaymentAccount[];
            const newReq = await this.mapInvoiceToFattura(updated, payments_list[0]);
            delete newReq.items_list;

            await callFicApi(FicRequest.MODIFY_INVOICE, oauthRequest, {
                id: invoice.fic.id,
                data: newReq
            });

            logger.info("Updating invoice on fic completed!");
        }

        return updated;
    }

    /**
     * Generates an invoice for a letter. You can't generate an invoice for letters that are not yet sent!
     * Please note that this does not generate a real invoice, rather a note for a single letter, a "distinta"
     *
     * @param letter {LetterDocument} Letter to generate invoice from
     * @param directory {string} Optional path to directory. If not specified, it will use public/pdf/{codePdf}
     * @returns {Promise<Buffer>} Promise resolvingu to the PDF file path
     */
    public async generateLetterInvoicePDF(letter: LetterDocument, directory?: string): Promise<string> {
        if (!letter.sent) {
            throw new httpErrors.Forbidden("Non è possibile generare la distinta per una lettera non ancora inviata.");
        }
        if (letter.error) {
            throw new httpErrors.Forbidden("Non è possibile generare la distinta per una lettera che non è stata inviata a causa di un errore.");
        }
        if (!letter.posteway) {
            throw new httpErrors.BadRequest("Non è possibile generare la distinta per una lettera che non ha comunicato con PosteWay.");
        }

        // Make directory if not already present
        const fileDirectory = directory ?? `${PDF_ROOT}/${letter.codePdf}`;
        if (!fs.existsSync(fileDirectory)) {
            fs.mkdirSync(fileDirectory);
        }

        // Avoid generating PDF again if it's already there
        const path = `${fileDirectory}/invoice.pdf`;
        if (fs.existsSync(path)) {
            return path;
        }

        await letter.populate("sender recipients").execPopulate();
        const price = letter.price ?? await this.priceService.calculatePrice(letter);

        try {
            // Call PosteWay to get the latest info
            letter = await this.letterService.queryLetter(letter);
        } catch (err) {
            logger.warn(`[INVOICE ${letter.codePdf}] Failed to query letter on PosteWay!`, err);
        }

        const dateSent = letter.sendAt ? moment(letter.sendAt).format("DD/MM/YYYY") : null;

        if (!letter.isTelegramma()) {
            // Format envelopes dates
            letter.posteway.track.recipients = letter.posteway.track.recipients?.map(r => ({
                ...r,
                person: {
                    ...r.person,
                    fullName: `${r.person.surname?.toUpperCase() ?? (r.person.businessName?.toUpperCase() ?? "")} ${r.person.name?.toUpperCase() ?? ""}`,
                },
                ...insert(letter.isRaccomandata() && !!r.tracking, {
                    tracking: {
                        ...r.tracking,
                        date: r.tracking?.date ? moment(r.tracking?.date, "DD/MM/YYYY hh:mm:ss").format("DD/MM/YYYY") : dateSent
                    }
                })
            }));
        } else {
            // In case of telegram, use populated recipients
            letter.posteway = {
                track: <any> {
                    recipients: letter.recipients.map((r: RecipientDocument, i) => ({
                        id: String(i + 1),
                        person: {
                            fullName: r.fullName,
                            address: r.address,
                        }
                    }))
                }
            }
        }

        const html = compileFile(`${process.env.VIEWS_ROOT}/invoice.pug`)({
            sender: letter.sender ? (letter.sender as SenderDocument).toObject() : {},
            posteway: (letter.posteway as Partial<Document>).toObject() || {},
            dateSent: dateSent,
            partial: false,
            codePdf: letter.codePdf,
            kind: letter.kind,
            price: formatCurrency(price),
            total: formatCurrency(price * letter.recipients.length),
            subject: letter.subject,
            text: letter.text,
        });

        // I wait until networkidle2 to let all the images on the HTML load before converting
        const pdf = await this.pdf.htmlToPdf(html, "networkidle2");
        await fs.promises.writeFile(path, pdf);
        return path;
    }

    /**
     * Generates a PDF representing the invoice.
     *
     * @param invoice {InvoiceDocument} Invoice to generate PDF from
     * @returns {Promise<Buffer>} Promise resolving to the PDF file as Buffer
     */
    public async generateInvoicePDF(invoice: InvoiceDocument): Promise<Buffer> {
        await invoice.populate("sender letters").execPopulate();
        const smsPrice: Array<number> = await Promise.all(invoice.letters.map(async (letter: LetterDocument) => await this.priceService.calculatePriceSMS(letter)));
        const createdAt = moment(invoice.toObject()["createdAt"]);
        const html = compileFile(`${process.env.VIEWS_ROOT}/letters_invoice.pug`)({
            sender: (invoice.sender as SenderDocument).toObject(),
            number: `${invoice.number}/${createdAt.year()}`,
            createdAt: createdAt.format("DD/MM/YYYY"),
            services: invoice.letters.map((letter: LetterDocument) => ({
                name: `${letter.kind} ONLINE`,
                date: moment(letter.createdAt).format("DD/MM/YYYY"),
                description: letter.subject,
                quantity: letter.recipients.length,
                priceSingle: formatCurrency(letter.price),
                total: formatCurrency(letter.price * letter.recipients.length),
                code: letter.codePdf,
            })),
            smsPrice: formatCurrency(smsPrice.reduce((acc, cur) => acc + cur, 0)),
            taxable: formatCurrency(invoice.taxable),
            discount: formatCurrency(invoice.discount ?? 0),
            iva: formatCurrency(invoice.iva),
            total: formatCurrency(invoice.total)
        });
        // I wait until networkidle2 to let all the images on the HTML load before converting
        return this.pdf.htmlToPdf(html, "networkidle2");
    }

    /**
     * mAP INVOICE TO DOCUMENT FOR Fatture in Cloud.
     * Throws if external FIC API call fails.
     *
     * @param invoice {InvoiceDocument} Invoice to export
     * @param payment_obj {PaymentAccount} Payment object
     * @returns {Promise<IssuedDocument>} Promise resolving to the same invoice with FIC field
     */
    private async mapInvoiceToFattura(invoice: InvoiceDocument, payment_obj: PaymentAccount): Promise<IssuedDocument> {
        invoice = await invoice.populate("sender letters").execPopulate();
        const sender = invoice.sender as SenderDocument;
        if (!sender) {
            throw new httpErrors.BadRequest("Questa fattura non ha un mittente. Non è stato possibile esportarla.");
        }

        const name = sender.businessName ?? sender.name;
        if (!name) {
            throw new httpErrors.BadRequest("Questo mittente non ha un nominativo. Non è stato possibile esportare la sua fattura.");
        }

        const { iva, cf } = sender;
        if (!iva && !cf) {
            throw new httpErrors.BadRequest("Questo mittente non ha valorizzati nè P.IVA nè Codice Fiscale. Non è stato possibile esportare la sua fattura.");
        }

        const address = sender.addressBill ?? sender.addressAR ?? sender.address;
        if (!address?.street) {
            throw new httpErrors.BadRequest("Questo mittente non ha un indirizzo. Non è stato possibile esportare la sua fattura.");
        }

        // Generate invoice expiration date
        const expiresAt = moment(invoice.createdAt).add(30, "days").format("YYYY-MM-DD");

        return {
            type: IssuedDocumentType.Invoice,
            number: invoice.number,
            numeration: `P`,
            e_invoice: true,
            ei_data: {
                vat_kind: VatKind.I,
                payment_method: "MP05", // Bonifico
                bank_beneficiary: "General Services SCC",
                bank_iban: process.env.FIC_IBAN
            },
            entity: {
                name,
                address_street: address.street,
                address_city: address.city,
                vat_number: iva,
                tax_code: cf,
                email: sender.email,
                e_invoice: true,
                ei_code: sender.invoiceCode.length === 7 ? sender.invoiceCode : undefined,
                certified_email: !(sender.invoiceCode.length === 7) ? sender.invoiceCode : undefined
            },
            payment_method: {
                name: "IBAN",
                bank_beneficiary: "General Services SCC",
                bank_iban: process.env.FIC_IBAN,
                is_default: true,
                default_payment_account: {
                    name: "IBAN",
                    iban: process.env.FIC_IBAN
                }
            },
            show_tspay_button: true,
            show_totals: ShowTotalsMode.All,
            show_payments: true,
            date: moment(invoice.createdAt).format("YYYY-MM-DD"),
            items_list: invoice.letters.map((letter: LetterDocument) => ({
                name: `${letter.kind} ONLINE`,
                qty: letter.recipients.length,
                description: letter.subject,
                net_price: letter.price,
                cod_iva: 0, // Punta ad aliquota IVA 22% (Default)
            })),
            payments_list: [{
                due_date: expiresAt,
                payment_account: {
                    id: payment_obj.id
                },
                paid_date: invoice.paid ? moment(invoice.paymentDate).format("YYYY-MM-DD") : undefined,
                status: invoice.paid ? IssuedDocumentStatus.Paid : IssuedDocumentStatus.NotPaid,
                amount: invoice.total,
            }],
            currency: {
                id: "EUR",
                symbol: "€"
            }
        };

        // return {
        //     ...auth,
        //     nome: name,
        //     indirizzo_via: address.street,
        //     indirizzo_citta: address.city,
        //     indirizzo_cap: address.zip,
        //     indirizzo_provincia: address.province,
        //     indirizzo_extra: address?.secondary,
        //     paese: "Italia",
        //     paese_iso: "IT",
        //     lingua: "it",
        //     piva: iva,
        //     cf: cf,
        //     autocompila_anagrafica: true,
        //     salva_anagrafica: !isTestEnv(),
        //     numero: !isTestEnv() ? `${invoice.number.toString()}P` : "P",
        //     data: moment(invoice.createdAt).format("DD/MM/YYYY"),
        //     valuta: "EUR",
        //     nascondi_scadenza: false,
        //     mostra_info_pagamento: true,
        //     metodo_pagamento: "Bonifico",
        //     metodo_titoloN: "IBAN",
        //     metodo_descN: IBAN,
        //     mostra_totali: "tutti",
        //     lista_articoli: invoice.letters.map((letter: LetterDocument) => ({
        //         nome: `${letter.kind} ONLINE`,
        //         quantita: letter.recipients.length,
        //         descrizione: letter.subject,
        //         prezzo_netto: letter.price,
        //         cod_iva: 0, // Punta ad aliquota IVA 22% (Default)
        //     })),
        //     lista_pagamenti: [{
        //         data_scadenza: expiresAt,
        //         metodo: "not",
        //         importo: invoice.total,
        //     }],
        //     extra_anagrafica: {
        //         mail: sender.email ?? "",
        //     },
        //     // Anagrafica PA B2B
        //     PA: true,
        //     PA_tipo_cliente: PA_TipoCliente.B2B,
        //     PA_numero: !isTestEnv() ? `${invoice.number.toString()}P` : "P",
        //     PA_data: moment(invoice.createdAt).format("DD/MM/YYYY"),
        //     PA_codice: !sender.invoiceCode.includes("@") ? sender.invoiceCode : null,
        //     PA_pec: sender.invoiceCode.includes("@") ? sender.invoiceCode : null,
        //     PA_esigibilita: "N",
        //     PA_modalita_pagamento: "MP05",
        //     PA_iban: IBAN,
        //     PA_beneficiario: "General Services SCC",
        // };

    }

    /**
     * Exports an invoice to Fatture in Cloud account.
     * Requires credentials to be defined in process environment, populates FIC field on success.
     * Throws if external FIC API call fails.
     *
     * @param exporter {UserDocument} Who is exporting this invoice (must be an admin)
     * @param invoice {InvoiceDocument} Invoice to export
     * @param requestParams {AuthorizeOAuth2ClientRequest} Fic v2 require param for connection
     * @returns {Promise<InvoiceDocument>} Promise resolving to the same invoice with FIC field
     */
    public async exportToFIC(exporter: UserDocument, invoice: InvoiceDocument, requestParams?: AuthorizeOAuth2ClientRequest): Promise<InvoiceDocument> {
        if (!exporter.isAdmin()) {
            throw new httpErrors.Forbidden("Permessi insufficienti per effettuare la richiesta.");
        }

        if (!!invoice.fic) {
            // Already exported
            return invoice;
        }

        const oauthRequest = findOauthRequest(requestParams.authorization);
        if (!oauthRequest?.access || !oauthRequest?.apiConfig) {
            throw {
                message: FicMessage.GET_AUTHORIZATION_URL,
                ficAuthorizationUri: authorizeOAuth2(requestParams)
            };
        }

        // const result = await this.fic.documenti.fatture.nuovo(
        //     await FIC.mapInvoiceToFattura(invoice)
        // );

        const payments_list = (await  callFicApi(FicRequest.GET_LIST_PAYMENT_METHODS, oauthRequest)) as PaymentAccount[];

        const result = await callFicApi(FicRequest.CREATE_INVOICE, oauthRequest, {
            data: await this.mapInvoiceToFattura(invoice, payments_list[0])
        } as CreateIssuedDocumentRequest) as IssuedDocument;

        invoice.fic = {
            id: result.id,
            token: result.attachment_token,
        };
        return invoice.save();
    }

    /**
     * Finds all invoices that do not have a FIC field and exports them to FIC by calling exportToFIC().
     * Returns an object containing what was exported and what wasn't due to an error.
     * Since FIC has a shitty hourly quota, this method will take a long ass time to execute, due to sleeps.
     * Progress will be pushed to the WebSockets channel.
     *
     * @param exporter {UserDocument} Who is exporting these invoices (must be an admin)
     * @param wait {boolean} True if you want to sleep 7.5 secs between each request
     * @param requestParams {AuthorizeOAuth2ClientRequest} Fic v2 require param for connection
     * @returns {Promise<void>} Resolves after starting the process because the export process is async
     */
    public async bulkExportToFIC(exporter: UserDocument, wait = true, requestParams?: AuthorizeOAuth2ClientRequest): Promise<void> {
        if (!exporter.isAdmin()) {
            throw new httpErrors.Forbidden("Permessi insufficienti per effettuare la richiesta.");
        }
        if (this.exportFlags.exporting) {
            throw new httpErrors.BadRequest("Un'esportazione è già in corso.");
        }

        const oauthRequest = findOauthRequest(requestParams.authorization);
        if (!oauthRequest?.access || !oauthRequest?.apiConfig) {
            throw {
                message: FicMessage.GET_AUTHORIZATION_URL,
                ficAuthorizationUri: authorizeOAuth2(requestParams)
            };
        }

        const toExport = await this.find({
            fic: { $exists: false }
        });

        const logFile = createLogFile(`fic_export_${Date.now()}.log`);
        const log = (msg: string, level: string = "info", ...args: any[]) => {
            logger.log(level, msg, ...args);
            logFile?.log(level, msg, ...args);
        }

        log(`STARTED BULK EXPORT TO FATTURE IN CLOUD OF ${toExport.length} INVOICES!`);

        const response: InvoiceBulkExportResponse = { exported: [], errors: [] };
        this.exportFlags.exporting = true;

        // Fatture in Cloud maximum quota is:
        // 30 requests per minute
        // 500 requests per hour
        // So sleeping 7.5 seconds should keep us under the quota
        (async () => {
            for (const invoice of toExport) {
                try {
                    const exported = await this.exportToFIC(exporter, invoice, requestParams);
                    this.exportFlags = {
                        exporting: true,
                        exported: response.exported.length,
                        to_export: toExport.length,
                        progress: parseFloat(((response.exported.length / toExport.length) * 100).toFixed(2)),
                    }

                    response.exported.push(exported);
                    ws_message(exported.id, {
                        kind: NoticeKind.FIC_EXPORT,
                        error: false,
                        data: this.exportFlags
                    });

                    wait && await sleep(7500);
                } catch (err) {
                    log(`Error while exporting invoice ${invoice.id} to FIC`, "error", err);
                    response.errors.push(err);
                    await this.noticeService.save({
                        user: exporter.id,
                        title: "Fattura non esportata",
                        content: `Non è stato possibile esportare la fattura nr.${invoice.number}/${moment(invoice.createdAt).year()} a causa di un problema. ${err.message}`,
                        data: err,
                        kind: NoticeKind.FIC_EXPORT,
                        error: true
                    });
                }
            }

            log(`DONE! I EXPORTED ${response.exported.length} INVOICES TO FATTURE IN CLOUD! GOT ${response.errors.length} ERRORS.`);
            this.exportFlags = {
                exporting: false,
                exported: 0,
                to_export: 0,
                progress: 0
            };

            await this.noticeService.save({
                user: exporter.id,
                title: "Fatture esportate correttamente",
                content: `Sono state esportate ${response.exported.length} fatture su Fatture in Cloud. Durante il processo si sono verificati ${response.errors.length} errori.`,
                data: response,
                kind: NoticeKind.INFO,
                error: false
            });

            logFile?.close();
        })();
    }

    public getExportFlags() {
        return this.exportFlags;
    }

}
