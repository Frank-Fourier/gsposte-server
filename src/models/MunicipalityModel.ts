import { Document, model, Model, Schema } from "mongoose";
import { array, boolean, Decoder, object, optional, string } from "@mojotech/json-type-validation";
import mongooseUniqueValidator from "mongoose-unique-validator";

/**
 * @swagger
 *
 * definitions:
 *   MunicipalityHamlet:
 *     type: object
 *     description: Frazione di un comune con CAP proprio (dal foglio FRAZIONE del CAP_GC Poste).
 *     required:
 *       - name
 *       - zip
 *     properties:
 *       name:
 *         type: string
 *         example: Bocca Di Magra
 *       zip:
 *         type: string
 *         example: "19030"
 *   Municipality:
 *     type: object
 *     required:
 *       - name
 *       - nameNormalized
 *       - province
 *       - zip
 *     properties:
 *       name:
 *         type: string
 *         description: Nome del comune in Title Case (display).
 *         example: Roma
 *       nameNormalized:
 *         type: string
 *         description: Nome del comune normalizzato (lowercase, no accenti) per ricerca/matching.
 *         example: roma
 *       province:
 *         type: string
 *         description: Sigla provincia (2 caratteri).
 *         example: RM
 *       provinceName:
 *         type: string
 *         description: Nome esteso della provincia.
 *         example: Roma
 *       region:
 *         type: string
 *         description: Nome della regione (vuoto per i pochi comuni non matchati con ISTAT).
 *         example: Lazio
 *       zip:
 *         type: array
 *         description: Lista dei CAP di recapito Poste (può contenerne molti per i grandi centri).
 *         example: [ "00118", "00119", "00121" ]
 *         items:
 *           type: string
 *       zipMain:
 *         type: string
 *         description: CAP "primario" (il primo in ordine numerico). Per i comuni piccoli è l'unico, per i GC è quello generico.
 *         example: "00118"
 *       isGrandeCentro:
 *         type: boolean
 *         description: True se il comune ha più di un CAP nel CAP_GC Poste (Roma, Milano, Napoli, ...).
 *         example: true
 *       hamlets:
 *         type: array
 *         description: Frazioni con CAP proprio (es. Bocca di Magra → Ameglia).
 *         items:
 *           $ref: "#/definitions/MunicipalityHamlet"
 *       country:
 *         type: string
 *         example: ITALY
 *       code:
 *         type: string
 *         description: Codice catastale (Belfiore) — opzionale, presente quando il comune è in ISTAT.
 *         example: H501
 *       istat:
 *         type: string
 *         description: Codice ISTAT del comune — opzionale, presente quando il comune è in ISTAT.
 *         example: "058091"
 *       source:
 *         type: string
 *         description: Tracciabilità della fonte ("POSTE_GC+ISTAT" se arricchito, "POSTE_GC" se solo Poste).
 *         example: POSTE_GC+ISTAT
 *   MunicipalityDocument:
 *     allOf:
 *       - $ref: '#/definitions/Municipality'
 *       - type: object
 *         properties:
 *           _id:
 *             type: string
 *             example: 5c991af86327ba47393f2fb3
 */
export interface MunicipalityHamlet {
    name: string
    zip: string
}
export interface Municipality {
    name: string
    nameNormalized: string
    province: string
    provinceName?: string
    region?: string
    zip: Array<string>
    zipMain?: string
    isGrandeCentro?: boolean
    hamlets?: Array<MunicipalityHamlet>
    country?: string
    code?: string
    istat?: string
    source?: string
}
export interface MunicipalityDocument extends Municipality, Document {
}

const hamletDecoder: Decoder<MunicipalityHamlet> = object({
    name: string(),
    zip: string(),
});

export const municipalityDecoder: Decoder<Municipality> = object({
    name: string(),
    nameNormalized: string(),
    province: string(),
    provinceName: optional(string()),
    region: optional(string()),
    zip: array(string()),
    zipMain: optional(string()),
    isGrandeCentro: optional(boolean()),
    hamlets: optional(array(hamletDecoder)),
    country: optional(string()),
    code: optional(string()),
    istat: optional(string()),
    source: optional(string()),
});

const HamletSchema = new Schema<MunicipalityHamlet>({
    name: { type: String, required: true, trim: true },
    zip: { type: String, required: true, trim: true, minlength: 5, maxlength: 5 },
}, { _id: false });

export const MunicipalitySchema = new Schema<Municipality>({
    name: {
        type: String,
        required: "Name is required.",
        maxlength: 60,
        trim: true,
    },
    nameNormalized: {
        type: String,
        required: "nameNormalized is required.",
        maxlength: 60,
        trim: true,
        lowercase: true,
    },
    province: {
        type: String,
        required: "Province is required.",
        trim: true,
        minlength: 2, maxlength: 2,
        uppercase: true,
    },
    provinceName: {
        type: String,
        trim: true,
        maxlength: 60,
    },
    region: {
        type: String,
        trim: true,
        maxlength: 40,
    },
    zip: [{
        type: String,
        required: "Zip codes are required.",
        trim: true,
        minlength: 5, maxlength: 5,
    }],
    zipMain: {
        type: String,
        trim: true,
        minlength: 5, maxlength: 5,
    },
    isGrandeCentro: {
        type: Boolean,
        default: false,
    },
    hamlets: {
        type: [ HamletSchema ],
        default: [],
    },
    country: {
        type: String,
        trim: true,
        default: "ITALY",
    },
    code: {
        type: String,
        trim: true,
        maxlength: 4,
    },
    istat: {
        type: String,
        trim: true,
        maxlength: 6,
    },
    source: {
        type: String,
        trim: true,
        maxlength: 32,
    },
});

// Indici per le query del frontend e degli endpoint /search, /by-zip, /by-istat, /validate.
//
// - nameNormalized + province: dropdown autocomplete con disambiguazione omonimi
// - zip: lookup CAP→comune (può tornare più documenti per CAP condivisi)
// - istat: unique solo per i record che lo hanno (sparse) — è la chiave logica ISTAT
// - province + nameNormalized: liste filtrate per provincia in backoffice
//
// NB: rimossa la unicità su `name` perché può capitare omonimia (es. "San Giovanni"
// in due province diverse) e perché il dataset è importato in bulk, non a mano.
MunicipalitySchema.index({ nameNormalized: 1, province: 1 });
MunicipalitySchema.index({ nameNormalized: 1 });
MunicipalitySchema.index({ zip: 1 });
MunicipalitySchema.index({ istat: 1 }, { unique: true, sparse: true });
MunicipalitySchema.index({ province: 1, nameNormalized: 1 });

MunicipalitySchema.plugin(mongooseUniqueValidator);

export const MunicipalityModel: Model<MunicipalityDocument> = model("Municipality", MunicipalitySchema);
