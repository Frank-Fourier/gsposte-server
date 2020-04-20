import { UserDocument } from "@models/UserModel";
import { LetterDocument } from "@models/LetterModel";
import { SenderDocument } from "@models/SenderModel";
import { Document, model, Model, Schema } from "mongoose";
import { array, Decoder, number, object, optional, string } from "@mojotech/json-type-validation";

/**
 * @swagger
 *
 * definitions:
 *   Invoice:
 *     type: object
 *     required:
 *       - sender
 *       - letters
 *       - number
 *       - taxable
 *       - iva
 *       - total
 *     properties:
 *       user:
 *         type: string
 *         example: 5c991af86327ba47393f2fb3
 *       sender:
 *         type: string
 *         example: 5c882af86327cf472932f2ls4
 *         description: Sender id of the letters
 *       letters:
 *         type: array
 *         items:
 *           type: string
 *         example: [ "5c882af86327cf472976f2ls4", "5b32481679f2b3215c530eaf", "5c2cdf122bbc2920aa205e64" ]
 *         description: Array of Letter ids
 *       number:
 *         type: number
 *         example: 420
 *         description: Progressive invoice number
 *       taxable:
 *         type: number
 *         example: 120.69
 *         description: Taxable price (imponibile)
 *       iva:
 *         type: number
 *         example: 22.8
 *         description: IVA from taxable (22%)
 *       total:
 *         type: number
 *         example: 142.77
 *         description: Total taxable + IVA
 *   InvoiceDocument:
 *     allOf:
 *       - $ref: '#/definitions/Invoice'
 *       - type: object
 *         properties:
 *          _id:
 *            type: string
 *            example: 5c991af86327ba47393f2fb3
 *          paid:
 *            type: boolean
 *            example: false
 *            description: True if this invoice was paid correctly
 *          paymentDate:
 *            type: string
 *            description: When this invoice was paid (not present if not paid)
 */
export interface Invoice {
    user?: string | UserDocument
    sender: string | SenderDocument
    letters: Array<string | LetterDocument>
    number: number
    taxable: number
    iva: number
    total: number
}
export interface InvoiceDocument extends Invoice, Document {
    paid: boolean
    paymentDate?: Date | string
}
export const invoiceDecoder: Decoder<Invoice> = object({
    user: optional(string()),
    sender: string(),
    letters: array(string()),
    number: number(),
    taxable: number(),
    iva: number(),
    total: number(),
});

export const InvoiceSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: "User is required.",
    },
    sender: {
        type: Schema.Types.ObjectId,
        ref: "Sender",
        required: "Sender is required.",
    },
    letters: [{
        type: Schema.Types.ObjectId,
        ref: "Letter",
        required: "Letters are required.",
    }],
    number: {
        type: Number,
        required: "Invoice number is required.",
    },
    taxable: {
        type: Number,
        required: "Taxable income is required.",
    },
    iva: {
        type: Number,
        required: "IVA is required.",
    },
    total: {
        type: Number,
        required: "Total is required",
    },
    paid: {
        type: Boolean,
        default: false,
    },
    paymentDate: {
        type: Date,
    }
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

export const InvoiceModel: Model<InvoiceDocument> = model("Invoice", InvoiceSchema);
