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
 * Definisce la lista dei beneficiari della suddivisione dei ricavi e le percentuali
 * di default. Override per Sender / User / Invoice batteranno questi valori a runtime
 * (vedi RevenueShareService.resolve).
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

export interface RevenueShareSetting {
    // I valori sono vincolati a livello mongoose schema (enum):
    //   name === "global", basis === "taxable"
    // Lascio "string" qui invece di literal types perché il @mojotech/json-type-validation
    // decoder usato altrove non sa esprimere literal types.
    name: string
    basis: string
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

export const RevenueShareBeneficiarySchema = new Schema<RevenueShareBeneficiary>({
    name: { type: String, required: true, trim: true, maxlength: 200 },
    fiscalCode: { type: String, required: true, trim: true, maxlength: 16 },
    iban: { type: String, trim: true, maxlength: 34 },
    percent: { type: Number, required: true, min: 0, max: 100 },
    isCompany: { type: Boolean, default: true },
});

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
    beneficiaries: RevenueShareOverrideBeneficiary[]
    note?: string
    overriddenBy?: string
    overriddenAt?: Date
}

export const revenueShareOverrideBeneficiaryDecoder: Decoder<RevenueShareOverrideBeneficiary> = object({
    beneficiaryId: string(),
    percent: number(),
});

export const revenueShareOverrideDecoder: Decoder<RevenueShareOverride> = object({
    beneficiaries: array(revenueShareOverrideBeneficiaryDecoder),
    note: optional(string()),
});

export const RevenueShareOverrideBeneficiarySchema = new Schema<RevenueShareOverrideBeneficiary>({
    beneficiaryId: { type: Schema.Types.ObjectId, required: true },
    percent: { type: Number, required: true, min: 0, max: 100 },
}, { _id: false });

export const RevenueShareOverrideSchema = new Schema<RevenueShareOverride>({
    beneficiaries: {
        type: [ RevenueShareOverrideBeneficiarySchema ],
        required: true,
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
export interface RevenueShareSnapshotLine {
    beneficiaryId: string
    name: string
    fiscalCode: string
    iban?: string
    percent: number
    amount: number
}

export interface RevenueShareSnapshot {
    // "invoice" | "sender" | "user" | "global", vincolato via mongoose enum.
    source: string
    lines: RevenueShareSnapshotLine[]
    basis: string
    basisValue: number
    computedAt: Date
}

export const RevenueShareSnapshotLineSchema = new Schema<RevenueShareSnapshotLine>({
    beneficiaryId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    fiscalCode: { type: String, required: true },
    iban: { type: String },
    percent: { type: Number, required: true },
    amount: { type: Number, required: true },
}, { _id: false });

export const RevenueShareSnapshotSchema = new Schema<RevenueShareSnapshot>({
    source: { type: String, required: true, enum: [ "invoice", "sender", "user", "global" ] },
    lines: { type: [ RevenueShareSnapshotLineSchema ], required: true },
    basis: { type: String, required: true, default: "taxable", enum: [ "taxable" ] },
    basisValue: { type: Number, required: true },
    computedAt: { type: Date, default: Date.now },
}, { _id: false });
