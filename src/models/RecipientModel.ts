import { UserDocument } from "@models/UserModel";
import { Document, model, Model, Schema } from "mongoose";
import { Decoder, object, optional, string } from "@mojotech/json-type-validation";

export interface Recipient {
    user?: string | UserDocument;
    fullName: string;
    address: string;
    secondaryAddress?: string;
    city: string;
    notes?: string;
}
export interface RecipientDocument extends Recipient, Document {
}
export const recipientDecoder: Decoder<Recipient> = object({
    user: optional(string()),
    fullName: string(),
    address: string(),
    secondaryAddress: optional(string()),
    city: string(),
    notes: optional(string()),
});

export const RecipientSchema = new Schema<Recipient>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: "User is required.",
    },
    fullName: {
        type: String,
        required: "Name is required.",
        maxlength: 100,
    },
    address: {
        type: String,
        required: "Address is required.",
        maxlength: 200,
    },
    secondaryAddress: {
        type: String,
        maxlength: 200,
    },
    city: {
        type: String,
        required: "City is required.",
        maxlength: 100,
    },
    notes: {
        type: String,
        maxlength: 500,
    },
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

export const RecipientModel: Model<RecipientDocument> = model("Recipient", RecipientSchema);
