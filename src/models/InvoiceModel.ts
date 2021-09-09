import { UserDocument } from "@models/UserModel";
import { LetterDocument } from "@models/LetterModel";
import { SenderDocument } from "@models/SenderModel";
import { Document, model, Model, Schema } from "mongoose";
import { array, Decoder, number, object, optional, string } from "@mojotech/json-type-validation";
import { ioc } from "@ioc";
import { SenderService } from "@services/SenderService";
import { UserService } from "@services/UserService";

export interface InvoiceFIC {
    id: number
    token: string
}

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
    discount?: number
    taxable: number
    iva: number
    total: number
}
export interface InvoiceDocument extends Invoice, Document {
    userName?: string;
    senderName?: string;
    senderBusinessName?: string;
    paid: boolean
    number: number
    paymentDate?: Date | string
    fic: InvoiceFIC
    createdAt?: Date
    updatedAt?: Date
}
export const invoiceDecoder: Decoder<Invoice> = object({
    user: optional(string()),
    sender: string(),
    letters: array(string()),
    discount: optional(number()),
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
    userName: String,
    sender: {
        type: Schema.Types.ObjectId,
        ref: "Sender",
        required: "Sender is required.",
    },
    senderName: String,
    senderBusinessName: String,
    letters: [{
        type: Schema.Types.ObjectId,
        ref: "Letter",
        required: "Letters are required.",
    }],
    number: {
        type: Number,
    },
    discount: {
        type: Number,
        default: 0,
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
    },
    fic: new Schema<InvoiceFIC>({
        success: {
            type: Boolean
        },
        id: {
            type: Number
        },
        token: {
            type: String
        },
    }),
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

InvoiceSchema.pre("save", async function(this: InvoiceDocument) {
    const user: UserDocument = await ioc.resolve(UserService).findById(this.user as string).catch(() => null);
    const sender: SenderDocument = await ioc.resolve(SenderService).findById(this.sender as string).catch(() => null);
    this.set("userName", user?.username);
    this.set("senderName", sender?.name);
    this.set("senderBusinessName", sender?.businessName);
});
InvoiceSchema.post("findOneAndUpdate", async function(this: any) {
    const invoice: InvoiceDocument = await this.model.findOne(this.getQuery());
    if (!invoice) {
        return;
    }
    const user: UserDocument = await ioc.resolve(UserService).findById(this.user as string).catch(() => null);
    const sender: SenderDocument = await ioc.resolve(SenderService).findById(this.sender as string).catch(() => null);
    await invoice.updateOne({
        $set: {
            userName: user?.username,
            senderName: sender?.name,
            senderBusinessName: sender?.businessName,
        }
    })
});

export const InvoiceModel: Model<InvoiceDocument> = model("Invoice", InvoiceSchema);
