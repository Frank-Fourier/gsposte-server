import { Document, model, Model, Schema } from "mongoose";
import { Decoder, object, optional, string } from "@mojotech/json-type-validation";
import mongooseUniqueValidator from "mongoose-unique-validator";

/**
 * @swagger
 *
 * definitions:
 *   Municipality:
 *     type: object
 *     required:
 *       - name
 *       - province
 *       - region
 *       - zip
 *     properties:
 *       name:
 *         type: string
 *         example: Andria
 *       province:
 *         type: string
 *         example: BA
 *       region:
 *         type: string
 *         example: Puglia
 *       zip:
 *         type: string
 *         example: "76123"
 *       country:
 *         type: string
 *         description: Will default to IT if not passed
 *         example: IT
 *       code:
 *         type: string
 *         description: Code used by the country to identify this municipality
 *         example: A285
 *   MunicipalityDocument:
 *     allOf:
 *       - $ref: '#/definitions/Municipality'
 *       - type: object
 *         properties:
 *           _id:
 *             type: string
 *             example: 5c991af86327ba47393f2fb3
 *           createdAt:
 *             type: string
 *             example: 2019-03-25T18:16:24.892Z
 *           updatedAt:
 *             type: string
 *             example: 2020-01-02T18:16:24.892Z
 */
export interface Municipality {
    name: string
    province: string
    region: string
    zip: string
    country?: string
    code?: string
}
export interface MunicipalityDocument extends Municipality, Document {
}
export const municipalityDecoder: Decoder<Municipality> = object({
    name: string(),
    province: string(),
    region: string(),
    zip: string(),
    country: optional(string()),
    code: optional(string()),
});

export const MunicipalitySchema = new Schema<Municipality>({
    name: {
        type: String,
        required: "Name is required.",
        maxlength: 33,
        unique: true
    },
    province: {
        type: String,
        required: "Province is required.",
        minlength: 2, maxlength: 2
    },
    zip: {
        type: String,
        required: "Zip code is required.",
        minlength: 5, maxlength: 5,
        unique: true
    },
    country: {
        type: String,
        default: "IT",
        minlength: 2, maxlength: 2
    },
    code: {
        type: String,
        minlength: 4, maxlength: 4,
    },
});

MunicipalitySchema.plugin(mongooseUniqueValidator);

export const MunicipalityModel: Model<MunicipalityDocument> = model("Municipality", MunicipalitySchema);
