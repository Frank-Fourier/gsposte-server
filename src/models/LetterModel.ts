import { Document, model, Model, Schema } from "mongoose";
import { Decoder, array, object, optional, string, oneOf, constant, number } from "@mojotech/json-type-validation";
import { UserDocument } from "@models/UserModel";
import { LetterType } from "@services/PostelService";
import { SenderDocument } from "@models/SenderModel";
import { RecipientDocument } from "@models/RecipientModel";
import { generateRandomCode } from "@utils/random";

export interface Letter {
    user?: string | UserDocument
    sender: string | SenderDocument
    recipients: Array<string | RecipientDocument>
    subject: string
    sendAt?: Date | string
    letterType: LetterType
    pdf: {
        pages: number
        uuid: string
    }
    notes?: string
}
export interface LetterDocument extends Letter, Document {
    code: string
}
export const letterDecoder: Decoder<Letter> = object({
    user: optional(string()),
    sender: string(),
    recipients: array(string()),
    subject: string(),
    sendAt: string(),
    letterType: oneOf(
        constant(LetterType.LETTERA_SEMPLICE),
        constant(LetterType.RACCOMANDATA),
        constant(LetterType.RACCOMANDATA_AR),
    ),
    pdf: object({
        pages: number(),
        uuid: string(),
    }),
    notes: optional(string()),
});

export const LetterSchema = new Schema<Letter>({
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
    recipients: {
        type: [ Schema.Types.ObjectId ],
        ref: "Recipient",
        required: "Recipients are required.",
    },
    subject: {
        type: String,
        required: "Subject is required.",
        maxlength: 100,
    },
    sendAt: {
        type: Date,
        default: Date.now,
    },
    letterType: {
        type: String,
        enum: [ LetterType.LETTERA_SEMPLICE, LetterType.RACCOMANDATA, LetterType.RACCOMANDATA_AR ],
        required: "Letter type is required.",
    },
    pdf: {
        type: new Schema({
            pages: {
                type: Number,
                required: "PDF page number is required.",
                min: 1,
            },
            uuid: {
                type: String,
                required: "PDF uuid is required.",
                minlength: 36,
                maxlength: 36
            }
        }, { _id: false }),
        required: "PDF details are required.",
    },
    code: {
        type: String,
        default: () => `GS${generateRandomCode()}`,
    },
    notes: {
        type: String,
        maxlength: 500,
    }
});

export const LetterModel: Model<LetterDocument> = model("Letter", LetterSchema);
