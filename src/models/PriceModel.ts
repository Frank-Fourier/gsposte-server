import { constant, Decoder, number, object, oneOf, optional } from "@mojotech/json-type-validation";
import { Document, model, Model, Schema } from "mongoose";
import { LetterKind } from "@models/LetterModel";

/**
 * @swagger
 *
 * definitions:
 *   Price:
 *     type: object
 *     required:
 *       - price
 *       - minWeight
 *       - maxWeight
 *       - kind
 *     properties:
 *       price:
 *         type: number
 *         example: 10.65
 *         description: The actual price value for this weight range
 *       minWeight:
 *         type: number
 *         example: 351
 *         description: Min weight (must be > 0) [grams]
 *       maxWeight:
 *         type: number
 *         example: 1000
 *         description: Max weight (must be > 0 and should be > minWeight) [grams]
 *       kind:
 *         type: string
 *         description: The letter kind of this price range. Can be "LETTERA SEMPLICE", "RACCOMANDATA", "RACCOMANDATA AR" or "RACCOMANDATA UNO".
 *         example: "RACCOMANDATA"
 *         enum:
 *           - "LETTERA SEMPLICE"
 *           - "RACCOMANDATA"
 *           - "RACCOMANDATA AR"
 *           - "RACCOMANDATA UNO"
 *       extra:
 *         type: string
 *         description: Extra price to add to base price. Defaults to 0.
 *         example: 0.70
 *   PriceDocument:
 *     allOf:
 *       - $ref: '#/definitions/Price'
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
export interface Price {
    price: number
    minWeight: number
    maxWeight: number
    kind: LetterKind
    extra?: number
}
export interface PriceDocument extends Price, Document {
}
export const priceDecoder: Decoder<Price> = object({
    price: number(),
    minWeight: number(),
    maxWeight: number(),
    kind: oneOf(
        constant(LetterKind.LETTERA_SEMPLICE),
        constant(LetterKind.RACCOMANDATA),
        constant(LetterKind.RACCOMANDATA_AR),
        constant(LetterKind.RACCOMANDATA_UNO),
        constant(LetterKind.RACCOMANDATA_UNO_AR),
    ),
    extra: optional(number()),
});

export const PriceSchema = new Schema<Price>({
    price: {
        type: Number,
        required: "Price is required.",
        min: 0
    },
    minWeight: {
        type: Number,
        required: "Min weight is required.",
        min: 0
    },
    maxWeight: {
        type: Number,
        required: "Max weight is required.",
        min: 0
    },
    kind: {
        type: String,
        enum: [
            LetterKind.LETTERA_SEMPLICE,
            LetterKind.RACCOMANDATA,
            LetterKind.RACCOMANDATA_AR,
            LetterKind.RACCOMANDATA_UNO,
            LetterKind.RACCOMANDATA_UNO_AR,
        ],
        required: "Kind is required.",
    },
    extra: {
        type: Number,
        default: 0
    },
});

export const PriceModel: Model<PriceDocument> = model("Price", PriceSchema);
