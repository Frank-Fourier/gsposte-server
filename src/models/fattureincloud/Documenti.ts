import { InvoiceDocument } from "@models/InvoiceModel";
import { SenderDocument } from "@models/SenderModel";
import { LetterDocument } from "@models/LetterModel";
import httpErrors from "http-errors";
import moment from "moment";
import { isTestEnv } from "@utils/system";

export namespace FIC {

    /**
     * FATTURE IN CLOUD API VERSION 0.9.14 - L
     * https://api.fattureincloud.it/v1/documentation/dist/#!/Documenti_emessi/DocNuovo
     */

    export const IBAN = "IT21L0301503200000003519941";

    export interface Auth {
        api_uid: string
        api_key: string
    }

    export interface Error {
        error: string
        error_code: number
    }

    export interface DocNuovoRequest extends Auth {
        id_cliente?: string
        id_fornitore?: string
        nome: string
        indirizzo_via?: string
        indirizzo_cap?: string
        indirizzo_citta?: string
        indirizzo_provincia?: string
        indirizzo_extra?: string
        paese?: string
        paese_iso?: string
        lingua?: string
        piva?: string
        cf?: string
        autocompila_anagrafica?: boolean
        salva_anagrafica?: boolean
        numero?: string
        data?: string
        valuta?: string
        valuta_cambio?: number
        prezzi_ivati?: boolean
        rivalsa?: number
        cassa?: number
        rit_acconto?: number
        imponibile_ritenuta?: number
        rit_altra?: number
        marca_bollo?: number
        oggetto_visibile?: string
        oggetto_interno?: string
        centro_ricavo?: string
        centro_costo?: string
        note?: string
        nascondi_scadenza?: boolean
        ddt?: boolean
        ftacc?: boolean
        id_template?: string
        ddt_id_template?: string
        ftacc_id_template?: string
        mostra_info_pagamento?: boolean
        metodo_pagamento?: string
        metodo_titoloN?: string
        metodo_descN?: string
        mostra_totali?: string
        mostra_bottone_paypal?: boolean
        mostra_bottone_bonifico?: boolean
        mostra_bottone_notifica?: boolean
        lista_articoli: DocNuovoArticolo[]
        lista_pagamenti: DocNuovoPagamento[]
        ddt_numero?: string
        ddt_data?: string
        ddt_colli?: string
        ddt_peso?: string
        ddt_causale?: string
        ddt_luogo?: string
        ddt_trasportatore?: string
        ddt_annotazioni?: string
        PA?: boolean
        PA_tipo_cliente?: PA_TipoCliente
        PA_tipo?: string
        PA_numero?: string
        PA_data?: string
        PA_cup?: string
        PA_cig?: string
        PA_codice?: string
        PA_pec?: string
        PA_esigibilita?: string
        PA_modalita_pagamento?: string
        PA_istituto_credito?: string
        PA_iban?: string
        PA_beneficiario?: string
        extra_anagrafica?: DocNuovoExtraAnagrafica
        split_payment?: boolean
    }

    export interface DocNuovoArticolo {
        id?: string
        codice?: string
        nome?: string
        um?: string
        quantita?: number
        descrizione?: string
        categoria?: string
        prezzo_netto?: number
        prezzo_lordo?: number
        cod_iva: number
        tassabile?: boolean
        sconto?: number
        applica_ra_contributi?: boolean
        ordine?: number
        sconto_rosso?: number
        in_ddt?: boolean
        magazzino?: boolean
    }

    export interface DocNuovoPagamento {
        data_scadenza: string
        importo: number
        metodo: string
        data_saldo?: string
    }

    export interface DocNuovoExtraAnagrafica {
        mail?: string
        tel?: string
        fax?: string
    }

    export function mapCredentialsToAuth(): Auth {
        const { FIC_API_UID, FIC_API_KEY } = process.env;
        if (!FIC_API_UID || !FIC_API_KEY) {
            throw new httpErrors.InternalServerError("Le credenziali di accesso a Fatture in Cloud non sono definite. Non è possibile accedervi.");
        }

        return {
            api_uid: FIC_API_UID,
            api_key: FIC_API_KEY,
        };
    }

    export async function mapInvoiceToFattura(invoice: InvoiceDocument): Promise<DocNuovoRequest> {
        const auth = mapCredentialsToAuth();

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
        const expiresAt = moment(invoice.createdAt).add(30, "days").format("DD/MM/YYYY");

        return {
            ...auth,
            nome: name,
            indirizzo_via: address.street,
            indirizzo_citta: address.city,
            indirizzo_cap: address.zip,
            indirizzo_provincia: address.province,
            indirizzo_extra: address?.secondary,
            paese: "Italia",
            paese_iso: "IT",
            lingua: "it",
            piva: iva,
            cf: cf,
            autocompila_anagrafica: true,
            salva_anagrafica: !isTestEnv(),
            numero: !isTestEnv() ? `${invoice.number.toString()}P` : "P",
            data: moment(invoice.createdAt).format("DD/MM/YYYY"),
            valuta: "EUR",
            nascondi_scadenza: false,
            mostra_info_pagamento: true,
            metodo_pagamento: "Bonifico",
            metodo_titoloN: "IBAN",
            metodo_descN: IBAN,
            mostra_totali: "tutti",
            lista_articoli: invoice.letters.map((letter: LetterDocument) => ({
                nome: `${letter.kind} ONLINE`,
                quantita: letter.recipients.length,
                descrizione: letter.subject,
                prezzo_netto: letter.price,
                cod_iva: 0, // Punta ad aliquota IVA 22% (Default)
            })),
            lista_pagamenti: [{
                data_scadenza: expiresAt,
                metodo: "not",
                importo: invoice.total,
            }],
            extra_anagrafica: {
                mail: sender.email ?? "",
            },
            // Anagrafica PA B2B
            PA: true,
            PA_tipo_cliente: PA_TipoCliente.B2B,
            PA_numero: !isTestEnv() ? `${invoice.number.toString()}P` : "P",
            PA_data: moment(invoice.createdAt).format("DD/MM/YYYY"),
            PA_codice: !sender.invoiceCode.includes("@") ? sender.invoiceCode : null,
            PA_pec: sender.invoiceCode.includes("@") ? sender.invoiceCode : null,
            PA_esigibilita: "N",
            PA_modalita_pagamento: "MP05",
            PA_iban: IBAN,
            PA_beneficiario: "General Services SCC",
        };
    }

    export interface NuovoDocumentoResponse {
        success: boolean
        new_id: number
        token: string
    }

    export enum TipoDoc {
        FATTURE = "fatture",
    }
    export enum PA_TipoCliente {
        PA = "PA",
        B2B = "B2B",
    }

}
