import { LetterDocument } from "@models/LetterModel";
import { UserDocument } from "@models/UserModel";
import { Document, model, Model, Schema } from "mongoose";
import { array, Decoder, number, object, optional, string } from "@mojotech/json-type-validation";

/**
 * @swagger
 *
 * definitions:
 *   Provision:
 *     type: object
 *     required:
 *       - letter
 *       - weight
 *       - users
 *     properties:
 *       letter:
 *         type: string
 *         description: Reference to the letter this provision comes from
 *         example: 5c991af86327ba47393f2fb3
 *       revenue:
 *         type: number
 *         description: Total amount of provision in €
 *         example: 100
 *       spent:
 *         type: number
 *         description: Total amount of € spent for this campaign
 *         example: 500
 *       weight:
 *         type: number
 *         description: Weight (in grams) of this letter (used to determine provisions range)
 *         example: 32
 *       referrers:
 *         type: array
 *         items:
 *           type: object
 *           required:
 *             - user
 *             - amount
 *             - percent
 *           properties:
 *             user:
 *               type: string
 *               description: Reference to the user receiving this amount of money
 *               example: 5c991af86327ba47393f2fb3
 *             amount:
 *               type: number
 *               description: Amount of € the user is getting
 *               example: 0.25
 *             percent:
 *               type: number
 *               description: Percentage value (%) the user is getting from the total provision
 *               example: 80
 *   ProvisionDocument:
 *     allOf:
 *       - $ref: '#/definitions/Provision'
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
export interface Provision {
    letter: string | LetterDocument
    revenue: number
    spent: number
    weight?: number
    referrers: Array<{
        user: string | UserDocument
        amount: number
        percent: number
    }>
}
export interface ProvisionDocument extends Provision, Document {
}
export const provisionDecoder: Decoder<Provision> = object({
    letter: string(),
    total: number(),
    revenue: number(),
    spent: number(),
    weight: optional(number()),
    referrers: array(object({
        user: string(),
        amount: number(),
        percent: number()
    })),
});

export const ProvisionSchema = new Schema<Provision>({
    letter: {
        type: Schema.Types.ObjectId,
        ref: "Letter",
        required: "Letter is required."
    },
    revenue: {
        type: Number,
        required: "Total provision amount is required."
    },
    spent: {
        type: Number,
        required: "Total spent amount is required."
    },
    weight: {
        type: Number
    },
    referrers: [{
        type: new Schema({
            user: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: "User is required."
            },
            amount: {
                type: Number,
                required: "Amount is required."
            },
            percent: {
                type: Number,
                required: "Percent is required."
            }
        }, { _id: false })
    }]
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

export const ProvisionModel: Model<ProvisionDocument> = model("Provision", ProvisionSchema);
