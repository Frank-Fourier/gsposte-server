import { UserDocument } from "@models/UserModel";
import { LetterDocument } from "@models/LetterModel";
import { Document, model, Model, Schema } from "mongoose";
import { Decoder, number, object, optional, string } from "@mojotech/json-type-validation";

export interface Invoice {
    user?: string | UserDocument
    letters?: Array<string | LetterDocument>
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
    letter: optional(string()),
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
});

export const InvoiceModel: Model<InvoiceDocument> = model("Invoice", InvoiceSchema);
