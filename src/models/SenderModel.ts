import { Document, model, Model, Schema } from "mongoose";
import { Decoder, object, optional, string } from "@mojotech/json-type-validation";
import { UserDocument } from "@models/UserModel";

export interface Sender {
    user: string | UserDocument
    name: string
    description: string
    address: string
    city: string
    iva?: string
    cf?: string
    email?: string
    notes?: string
}
export interface SenderDocument extends Sender, Document {
}
export const senderDecoder: Decoder<Sender> = object({
    user: string(),
    name: string(),
    description: string(),
    address: string(),
    city: string(),
    iva: optional(string()),
    cf: optional(string()),
    email: optional(string()),
    notes: optional(string()),
});

export const SenderSchema = new Schema<Sender>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: "User is required.",
    },
    name: {
        type: String,
        required: "Name is required.",
    },
    description: {
        type: String,
        required: "Description is required.",
    },
    address: {
        type: String,
        required: "Address is required.",
    },
    city: {
        type: String,
        required: "City is required.",
    },
    iva: {
        type: String,
        maxlength: 11,
    },
    cf: {
        type: String,
        maxlength: 16,
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
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

export const SenderModel: Model<SenderDocument> = model("Sender", SenderSchema);
