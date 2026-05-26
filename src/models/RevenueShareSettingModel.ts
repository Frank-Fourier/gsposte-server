import { Document, model, Model, Schema } from "mongoose";
import {
    array,
    boolean,
    Decoder,
    number,
    object,
    optional,
    string
} from "@mojotech/json-type-validation";

/**
 * RevenueShareSetting è un SINGLETON: esiste un solo documento con name="global".
 *
 * Modello a 2 LIVELLI:
 *
 *   taxable
 *      │
 *      ├── ADMIN FEE (opzionale, "compenso amministratore") → adminFee.beneficiaryId
 *      │     contabilmente: fattura passiva dell'amministratore verso la società
 *      │     emittente. Per Solutions è un COSTO DEDUCIBILE.
 *      │
 *      └── RESIDUO = taxable - adminFee → ripartito tra beneficiaries[] secondo %
 *
 * Override su Sender/User/Invoice possono sovrascrivere:
 *   - adminFee (un valore diverso, es. 20% invece del 30% globale)
 *   - disableAdminFee=true (nessuna fee per quel cliente)
 *   - beneficiaries (ripartizione del residuo diversa)
 *
 * Decisioni di design:
 *  - basis: SEMPRE "taxable" (imponibile). NON è esposto come setting modificabile.
 *    Motivo: lo split su "total" (IVA inclusa) farebbe incassare a beneficiari secondari
 *    porzioni di IVA che però vengono versate interamente dall'azienda emittente
 *    (errore contabile sistematico).
 *  - tieBreakCursor: serve al largest-remainder method per il round-robin del
 *    "centesimo dispari" — viene incrementato a ogni risoluzione di split per
 *    garantire equità nel lungo periodo tra beneficiari con stessa percentuale.
 *  - Le percentuali in beneficiaries[].percent sono in scala 0..100 con max 2 decimali.
 *    La somma DEVE essere ≈100 (validazione con tolleranza ±0.10 a livello di
 *    service, non schema, per accettare arrotondamenti dell'utente).
 *  - AdminFee.kind="fixed" con value > taxable viene capata al 100% di taxable
 *    (warning loggato): il residuo va a zero, i beneficiaries[] non ricevono nulla.
 *  - Tandoi è esente IVA (regime forfettario): il software NON genera/calcola IVA
 *    sulla admin fee. Quella viene gestita esternamente dal commercialista.
 */

/**
 * @swagger
 *
 * definitions:
 *   RevenueShareBeneficiary:
 *     type: object
 *     required:
 *       - name
 *       - fiscalCode
 *       - percent
 *     properties:
 *       _id:
 *         type: string
 *         description: ObjectId generato da MongoDB
 *       name:
 *         type: string
 *         example: "Solutions S.r.l."
 *       fiscalCode:
 *         type: string
 *         description: P.IVA o codice fiscale del beneficiario
 *         example: "08886590721"
 *       iban:
 *         type: string
 *         example: "IT44Z0306941473100000015095"
 *       percent:
 *         type: number
 *         description: Percentuale 0..100, max 2 decimali
 *         example: 50
 *       isCompany:
 *         type: boolean
 *         description: true per società, false per professionista persona fisica
 *         example: true
 *   RevenueShareSetting:
 *     type: object
 *     properties:
 *       name:
 *         type: string
 *         example: "global"
 *       basis:
 *         type: string
 *         enum: [ "taxable" ]
 *       beneficiaries:
 *         type: array
 *         items:
 *           $ref: "#/definitions/RevenueShareBeneficiary"
 *       tieBreakCursor:
 *         type: number
 */
export interface RevenueShareBeneficiary {
    _id?: string
    name: string
    fiscalCode: string
    iban?: string
    percent: number
    isCompany?: boolean
}

/**
 * Compenso amministratore. Sempre applicato prima dello split del residuo.
 *  - kind="percent": value è una % 0..100 del taxable
 *  - kind="fixed":  value è un importo in € (cappato al taxable se eccede)
 *  - beneficiaryId: ObjectId di un beneficiario presente in beneficiaries[]
 *  - label: testo libero, default "Compenso amministratore"
 */
export interface AdminFee {
    kind: string             // "percent" | "fixed", vincolato via mongoose enum
    value: number
    beneficiaryId: string
    label?: string
}

export interface RevenueShareSetting {
    // I valori sono vincolati a livello mongoose schema (enum):
    //   name === "global", basis === "taxable"
    // Lascio "string" qui invece di literal types perché il @mojotech/json-type-validation
    // decoder usato altrove non sa esprimere literal types.
    name: string
    basis: string
    adminFee?: AdminFee
    beneficiaries: RevenueShareBeneficiary[]
    tieBreakCursor?: number
}

export interface RevenueShareSettingDocument extends RevenueShareSetting, Document {
    updatedBy?: string
    updatedAt?: Date
    createdAt?: Date
}

export const revenueShareBeneficiaryDecoder: Decoder<RevenueShareBeneficiary> = object({
    _id: optional(string()),
    name: string(),
    fiscalCode: string(),
    iban: optional(string()),
    percent: number(),
    isCompany: optional(boolean()),
});

export const adminFeeDecoder: Decoder<AdminFee> = object({
    kind: string(),
    value: number(),
    beneficiaryId: string(),
    label: optional(string()),
});

export const RevenueShareBeneficiarySchema = new Schema<RevenueShareBeneficiary>({
    name: { type: String, required: true, trim: true, maxlength: 200 },
    fiscalCode: { type: String, required: true, trim: true, maxlength: 16 },
    iban: { type: String, trim: true, maxlength: 34 },
    percent: { type: Number, required: true, min: 0, max: 100 },
    isCompany: { type: Boolean, default: true },
});

export const AdminFeeSchema = new Schema<AdminFee>({
    kind: { type: String, required: true, enum: [ "percent", "fixed" ] },
    value: { type: Number, required: true, min: 0 },
    beneficiaryId: { type: Schema.Types.ObjectId, required: true },
    label: { type: String, default: "Compenso amministratore", maxlength: 200 },
}, { _id: false });

export const RevenueShareSettingSchema = new Schema<RevenueShareSetting>({
    name: {
        type: String,
        required: true,
        unique: true,
        default: "global",
        enum: [ "global" ],
    },
    basis: {
        type: String,
        required: true,
        default: "taxable",
        enum: [ "taxable" ],
    },
    adminFee: {
        type: AdminFeeSchema,
    },
    beneficiaries: {
        type: [ RevenueShareBeneficiarySchema ],
        required: true,
        validate: {
            validator: (arr: RevenueShareBeneficiary[]) => arr.length >= 1 && arr.length <= 10,
            message: "Il numero di beneficiari deve essere compreso tra 1 e 10."
        }
    },
    tieBreakCursor: { type: Number, default: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

export const RevenueShareSettingModel: Model<RevenueShareSettingDocument> =
    model("RevenueShareSetting", RevenueShareSettingSchema);

/**
 * Schema embedded riusato come `revenueShare?` su Sender, User, Invoice.
 * Contiene SOLO il riferimento ai beneficiari del singleton (via _id) e la percentuale
 * di override; nome / fiscalCode / iban vengono presi dal singleton al momento del
 * resolve (single source of truth: se cambi i dati anagrafici del beneficiario nel
 * singleton, vengono aggiornati ovunque venga risolto un override).
 */
export interface RevenueShareOverrideBeneficiary {
    beneficiaryId: string
    percent: number
}

export interface RevenueShareOverride {
    // Tutti i campi sono OPZIONALI: ogni override può sovrascrivere zero, uno o
    // tutti gli aspetti del livello superiore.
    //  - adminFee presente → sovrascrive quella globale per questo livello
    //  - disableAdminFee=true → forza nessuna fee per questo livello (battendo anche un eventuale adminFee dell'override)
    //  - beneficiaries presente (non vuoto) → sovrascrive la ripartizione del residuo
    adminFee?: AdminFee
    disableAdminFee?: boolean
    beneficiaries?: RevenueShareOverrideBeneficiary[]
    note?: string
    overriddenBy?: string
    overriddenAt?: Date
}

export const revenueShareOverrideBeneficiaryDecoder: Decoder<RevenueShareOverrideBeneficiary> = object({
    beneficiaryId: string(),
    percent: number(),
});

export const revenueShareOverrideDecoder: Decoder<RevenueShareOverride> = object({
    adminFee: optional(adminFeeDecoder),
    disableAdminFee: optional(boolean()),
    beneficiaries: optional(array(revenueShareOverrideBeneficiaryDecoder)),
    note: optional(string()),
});

export const RevenueShareOverrideBeneficiarySchema = new Schema<RevenueShareOverrideBeneficiary>({
    beneficiaryId: { type: Schema.Types.ObjectId, required: true },
    percent: { type: Number, required: true, min: 0, max: 100 },
}, { _id: false });

export const RevenueShareOverrideSchema = new Schema<RevenueShareOverride>({
    adminFee: { type: AdminFeeSchema },
    disableAdminFee: { type: Boolean, default: false },
    beneficiaries: {
        type: [ RevenueShareOverrideBeneficiarySchema ],
    },
    note: { type: String, maxlength: 500 },
    overriddenBy: { type: Schema.Types.ObjectId, ref: "User" },
    overriddenAt: { type: Date, default: Date.now },
}, { _id: false });

/**
 * Snapshot immutabile: viene scritto su Invoice.splitSnapshot al momento in cui
 * la fattura passa a paid=true e congela:
 *  - la fonte (invoice|sender|user|global) — utile per audit
 *  - i dati anagrafici dei beneficiari al momento dello snapshot
 *  - gli importi in € già calcolati (con largest-remainder applicato)
 *  - l'importo base usato (taxable in quell'istante)
 *  - il timestamp
 *
 * Una volta scolpito, NON viene mai più rigenerato anche se cambi setting/override.
 */
/**
 * Una RIGA dello snapshot. Due tipologie:
 *  - type="admin-fee": riga della fee amministratore. `kind` riporta il tipo di
 *    fee applicata (percent|fixed). Se kind="percent", `percent` è la % usata
 *    (es. 30) e `amount` è il valore € risultante. Se kind="fixed", `percent`
 *    è 0 e `amount` è il valore fisso applicato (eventualmente cappato).
 *  - type="share": riga di ripartizione del residuo (taxable - adminFee).
 *    `percent` è la % applicata sul residuo (NON sul taxable totale!),
 *    `kind` è sempre "percent".
 */
export interface RevenueShareSnapshotLine {
    type: string                // "admin-fee" | "share"
    kind: string                // "percent" | "fixed"
    beneficiaryId: string
    name: string
    fiscalCode: string
    iban?: string
    percent: number
    amount: number
    label?: string
}

export interface RevenueShareSnapshot {
    // "invoice" | "sender" | "user" | "global", vincolato via mongoose enum.
    source: string
    lines: RevenueShareSnapshotLine[]
    basis: string
    basisValue: number          // taxable totale della fattura
    adminFeeAmount?: number     // 0 se nessuna fee applicata
    residuoValue?: number       // taxable - adminFeeAmount (= basisValue se no fee)
    computedAt: Date
}

export const RevenueShareSnapshotLineSchema = new Schema<RevenueShareSnapshotLine>({
    type: { type: String, required: true, enum: [ "admin-fee", "share" ] },
    kind: { type: String, required: true, enum: [ "percent", "fixed" ], default: "percent" },
    beneficiaryId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    fiscalCode: { type: String, required: true },
    iban: { type: String },
    percent: { type: Number, required: true },
    amount: { type: Number, required: true },
    label: { type: String, maxlength: 200 },
}, { _id: false });

export const RevenueShareSnapshotSchema = new Schema<RevenueShareSnapshot>({
    source: { type: String, required: true, enum: [ "invoice", "sender", "user", "global" ] },
    lines: { type: [ RevenueShareSnapshotLineSchema ], required: true },
    basis: { type: String, required: true, default: "taxable", enum: [ "taxable" ] },
    basisValue: { type: Number, required: true },
    adminFeeAmount: { type: Number, default: 0 },
    residuoValue: { type: Number },
    computedAt: { type: Date, default: Date.now },
}, { _id: false });
