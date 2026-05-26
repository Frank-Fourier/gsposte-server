import { Document, model, Model, Schema } from "mongoose";

/**
 * RevenueShareSetting è un SINGLETON: esiste un solo documento con name="global".
 *
 * Modello a 2 LIVELLI:
 *
 *   taxable
 *      │
 *      ├── ADMIN FEE = taxable * adminFeePercent / 100
 *      │     va all'User che ha emesso la fattura (invoice.user).
 *      │     L'User può avere un override personale (User.adminFeePercent),
 *      │     altrimenti eredita questo valore globale.
 *      │     I dati anagrafici (CF/PIVA + IBAN) sono presi dal User
 *      │     (User.payoutFiscalCode, User.payoutIban, User.payoutName).
 *      │     Se mancano: snapshot creato comunque con IBAN vuoto + warning.
 *      │
 *      └── RESIDUO = taxable - adminFee
 *            ripartito tra ESATTAMENTE 2 beneficiari fissi:
 *              - Solutions S.r.l.            (default 80%)
 *              - Francesco Filippo Tandoi    (default 20%)
 *            Le % del residuo sono configurabili globalmente con tolleranza
 *            ±0.10 sulla somma.
 *
 * NON esistono override per Sender / Invoice. Il sistema è volutamente
 * semplice: chi opera la piattaforma (User) prende la admin fee, Solutions +
 * Tandoi spartiscono il residuo.
 *
 * Decisioni di design:
 *  - basis: SEMPRE "taxable" (imponibile). NON è esposto come setting modificabile.
 *    Motivo: lo split su "total" (IVA inclusa) farebbe incassare a beneficiari
 *    secondari porzioni di IVA che però vengono versate interamente dall'azienda
 *    emittente (errore contabile sistematico).
 *  - tieBreakCursor: serve al largest-remainder method per il round-robin del
 *    "centesimo dispari" sui 2 beneficiari del residuo.
 *  - Tandoi è esente IVA (regime forfettario): il software NON genera/calcola IVA
 *    sulla admin fee né sulla sua quota residuo. La gestione fiscale è demandata
 *    al commercialista.
 *  - Tandoi NON è amministratore di condominio: è solo lo sviluppatore della
 *    piattaforma e uno dei due beneficiari del residuo. La admin fee non gli
 *    viene mai accreditata (a meno che lui stesso non figuri come User che
 *    emette fatture, scenario ipotetico).
 */

/**
 * @swagger
 *
 * definitions:
 *   ResidualBeneficiary:
 *     type: object
 *     required: [ name, fiscalCode, percent ]
 *     properties:
 *       _id:        { type: string, description: "ObjectId generato da MongoDB" }
 *       name:       { type: string, example: "Solutions S.r.l." }
 *       fiscalCode: { type: string, example: "08886590721" }
 *       iban:       { type: string, example: "IT44Z0306941473100000015095" }
 *       percent:    { type: number, description: "0..100, max 2 decimali", example: 80 }
 *       isCompany:  { type: boolean, example: true }
 *   RevenueShareSetting:
 *     type: object
 *     properties:
 *       name:                 { type: string, example: "global" }
 *       basis:                { type: string, enum: [ "taxable" ] }
 *       adminFeePercent:      { type: number, description: "0..100, max 2 decimali", example: 30 }
 *       residualBeneficiaries:
 *         type: array
 *         minItems: 2
 *         maxItems: 2
 *         items: { $ref: "#/definitions/ResidualBeneficiary" }
 *       tieBreakCursor:       { type: number }
 */
export interface ResidualBeneficiary {
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
    name: string
    basis: string
    adminFeePercent: number
    residualBeneficiaries: ResidualBeneficiary[]
    tieBreakCursor?: number
}

export interface RevenueShareSettingDocument extends RevenueShareSetting, Document {
    updatedBy?: string
    updatedAt?: Date
    createdAt?: Date
}

export const ResidualBeneficiarySchema = new Schema<ResidualBeneficiary>({
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
    adminFeePercent: {
        type: Number,
        required: true,
        default: 30,
        min: 0,
        max: 100,
    },
    residualBeneficiaries: {
        type: [ ResidualBeneficiarySchema ],
        required: true,
        validate: {
            validator: (arr: ResidualBeneficiary[]) => arr.length === 2,
            message: "I beneficiari del residuo devono essere esattamente 2 (Solutions + Tandoi)."
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
 * Snapshot immutabile: viene scritto su Invoice.splitSnapshot al momento in cui
 * la fattura passa a paid=true. Congela:
 *  - i dati anagrafici di amministratore + beneficiari residuo al momento snapshot
 *  - gli importi in € già calcolati (con largest-remainder sui residui)
 *  - taxable, adminFee, residuo
 *  - timestamp
 *
 * Una volta scolpito, NON viene mai più rigenerato anche se cambi setting/User.
 */
export interface RevenueShareSnapshotLine {
    type: string                // "admin-fee" | "share"
    userId?: string             // valorizzato per type="admin-fee": ref a User che ha emesso
    beneficiaryId?: string      // valorizzato per type="share": ref a ResidualBeneficiary
    name: string
    fiscalCode: string
    iban?: string
    percent: number             // % sul taxable (admin-fee) o sul residuo (share)
    amount: number              // € arrotondato a 2 decimali
    label?: string
}

export interface RevenueShareSnapshot {
    lines: RevenueShareSnapshotLine[]
    basis: string               // sempre "taxable"
    basisValue: number          // taxable totale della fattura
    adminFeeAmount: number      // 0 se mancano dati payout / fee=0
    residuoValue: number        // taxable - adminFeeAmount
    adminFeePercentApplied: number   // % effettivamente usata (User override o globale)
    computedAt: Date
}

export const RevenueShareSnapshotLineSchema = new Schema<RevenueShareSnapshotLine>({
    type: { type: String, required: true, enum: [ "admin-fee", "share" ] },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    beneficiaryId: { type: Schema.Types.ObjectId },
    name: { type: String, required: true },
    fiscalCode: { type: String, default: "" },
    iban: { type: String },
    percent: { type: Number, required: true },
    amount: { type: Number, required: true },
    label: { type: String, maxlength: 200 },
}, { _id: false });

export const RevenueShareSnapshotSchema = new Schema<RevenueShareSnapshot>({
    lines: { type: [ RevenueShareSnapshotLineSchema ], required: true },
    basis: { type: String, required: true, default: "taxable", enum: [ "taxable" ] },
    basisValue: { type: Number, required: true },
    adminFeeAmount: { type: Number, required: true, default: 0 },
    residuoValue: { type: Number, required: true },
    adminFeePercentApplied: { type: Number, required: true },
    computedAt: { type: Date, default: Date.now },
}, { _id: false });
