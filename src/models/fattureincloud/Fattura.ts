import { InvoiceDocument } from "@models/InvoiceModel";
import { SenderDocument } from "@models/SenderModel";
import moment from "moment";
import { LetterDocument } from "@models/LetterModel";

namespace FIC {

    /**
     * FATTURE IN CLOUD API VERSION 0.9.14 - L
     */

    export interface Auth {
        api_uid: string
        api_key: string
    }

    export interface Error {
        error: string
        error_code: number
    }

    export interface Fattura extends Auth {
        id_cliente?: string
        id_fornitore?: string
        nome: string
        indirizzo_via: string
        indirizzo_cap: string
        indirizzo_citta: string
        indirizzo_provincia: string
        indirizzo_extra: string
        paese: string
        paese_iso: string
        lingua: string
        piva: string
        cf: string
        autocompila_anagrafica: boolean
        salva_anagrafica: boolean
        numero: string
        data: string
        valuta: string
        valuta_cambio: number
        prezzi_ivati: boolean
        rivalsa: number
        cassa: number
        rit_acconto: number
        imponibile_ritenuta: number
        rit_altra: number
        marca_bollo: number
        oggetto_visibile: string
        oggetto_interno:string
        centro_ricavo: string
        centro_costo: string
        note: string
        nascondi_scadenza: boolean
        ddt: boolean
        ftacc: boolean
        id_template?: string
        ddt_id_template?: string
        ftacc_id_template?: string
        mostra_info_pagamento: boolean
        metodo_pagamento: string // "Bonifico",
        metodo_titoloN: string // "IBAN"
        metodo_descN: string // IBAN value
        mostra_totali: string // "tutti"
        mostra_bottone_paypal: boolean
        mostra_bottone_bonifico: boolean
        mostra_bottone_notifica: boolean
        lista_articoli: {
            id: string
            codice: string
            nome: string
            um: string
            quantita: number
            descrizione: string
            categoria: string
            prezzo_netto: number
            prezzo_lordo: number
            cod_iva: number
            tassabile: boolean
            sconto: number
            applica_ra_contributi: boolean
            ordine: number
            sconto_rosso: number
            in_ddt: boolean
            magazzino: boolean
        }[]
        lista_pagamenti: {
            data_scadenza: string
            importo: number
            metodo: string // "not"
            data_saldo: string
        }[]
        ddt_numero?: string
        ddt_data?: string
        ddt_colli?: string
        ddt_peso?: string
        ddt_causale?: string
        ddt_luogo?: string
        ddt_trasportatore?: string
        ddt_annotazioni?: string
        PA: boolean
        PA_tipo_cliente?: string
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
        extra_anagrafica: {
            mail?: string
            tel?: string
            fax?: string
        }
        split_payment: boolean
    }

    export async function mapInvoiceToFattura(invoice: InvoiceDocument): Promise<Fattura> {
        const { FIC_API_UID, FIC_API_KEY } = process.env;
        if (!FIC_API_UID || !FIC_API_KEY) {
            throw new Error("Le credenziali di accesso a Fatture in Cloud non sono definite. Non è possibile esportare le fatture.");
        }

        invoice = await invoice.populate("sender letters").execPopulate();
        const sender = invoice.sender as SenderDocument;
        if (!sender) {
            throw new Error("Questa fattura non ha un mittente. Non è stato possibile esportarla.");
        }

        const name = sender.businessName ?? sender.name;
        if (!name) {
            throw new Error("Questo mittente non ha un nominativo. Non è stato possibile esportare la sua fattura.");
        }

        const { iva, cf } = sender;
        if (!iva && !cf) {
            throw new Error("Questo mittente non ha valorizzati nè P.IVA nè Codice Fiscale. Non è stato possibile esportare la sua fattura.");
        }

        const address = sender.addressBill ?? sender.addressAR ?? sender.address;
        if (!address?.street) {
            throw new Error("Questo mittente non ha un indirizzo. Non è stato possibile esportare la sua fattura.");
        }

        // Generate invoice expiration date
        const expiresAt = moment(invoice.createdAt).add(30, "days").format("DD/MM/YYYY");

        return {
            api_uid: FIC_API_UID,
            api_key: FIC_API_KEY,
            nome: name,
            indirizzo_via: address.street,
            indirizzo_citta: address.city ?? "",
            indirizzo_cap: address.zip ?? "",
            indirizzo_provincia: address.province ?? "",
            indirizzo_extra: address?.secondary ?? "",
            paese: "Italia",
            paese_iso: "IT",
            lingua: "it",
            piva: iva,
            cf: cf,
            autocompila_anagrafica: true,
            salva_anagrafica: true,
            numero: invoice.number.toString(),
            data: moment(invoice.createdAt).format("DD/MM/YYYY"),
            valuta: "EUR",
            valuta_cambio: 1,
            prezzi_ivati: false, // ???
            rivalsa: 0, // ???
            cassa: 0, // ???
            rit_acconto: 0, // ???
            imponibile_ritenuta: 0,
            rit_altra: 0,
            marca_bollo: 0, // ???
            oggetto_visibile: "", // ???
            oggetto_interno: "", // ???
            centro_ricavo: "", // ???
            centro_costo: "", // ???
            note: "",
            nascondi_scadenza: false,
            ddt: false,
            ftacc: false,
            mostra_info_pagamento: true,
            metodo_pagamento: "Bonifico",
            metodo_titoloN: "IBAN",
            metodo_descN: "IT21L0301503200000003519941",
            mostra_totali: "tutti",
            mostra_bottone_paypal: false,
            mostra_bottone_bonifico: false,
            mostra_bottone_notifica: false,
            lista_articoli: invoice.letters.map((letter: LetterDocument) => {
                const prezzo_netto = letter.price * letter.recipients.length; // Senza IVA
                return {
                    id: letter.id,
                    codice: letter.codePdf,
                    nome: `${letter.kind} ONLINE`,
                    um: "",
                    quantita: letter.recipients.length,
                    descrizione: letter.subject,
                    categoria: "",
                    prezzo_netto: prezzo_netto,
                    prezzo_lordo: prezzo_netto + prezzo_netto * 22 / 100, // Applico IVA al singolo
                    cod_iva: 22,
                    tassabile: true,
                    sconto: 0,
                    applica_ra_contributi: false, // ???
                    ordine: 0, // ???
                    sconto_rosso: 0, // Comunista
                    in_ddt: false,
                    magazzino: false, // ???
                };
            }),
            lista_pagamenti: [{
                data_scadenza: expiresAt,
                data_saldo: expiresAt,
                metodo: "not",
                importo: invoice.total,
            }],
            PA: false,
            extra_anagrafica: {
                mail: sender.email ?? "",
                tel: "",
                fax: "",
            },
            split_payment: false,
        };
    }

    export interface NuovoDocumentoResponse {
        success: boolean
        new_id: number
        token: string
    }

}
