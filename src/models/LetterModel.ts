import { Document, model, Model, Schema } from "mongoose";
import {
    Decoder,
    array,
    object,
    optional,
    string,
    oneOf,
    constant,
    boolean, number
} from "@mojotech/json-type-validation";
import { UserDocument } from "@models/UserModel";
import { SenderDocument } from "@models/SenderModel";
import { Recipient, RecipientDocument } from "@models/RecipientModel";
import { InvoiceDocument } from "@models/InvoiceModel";
import { Person, PriceResponse, TelegramTicket, TrackResponse } from "../posteway";
import { addressDecoder, AddressSchema } from "@models/schemas/AddressSchema";

export enum LetterKind {
    "LETTERA_SEMPLICE" = "LETTERA SEMPLICE",
    "LETTERA_PRIORITARIA" = "LETTERA PRIORITARIA",
    "RACCOMANDATA" = "RACCOMANDATA",
    "RACCOMANDATA_AR" = "RACCOMANDATA AR",
    "RACCOMANDATA_UNO" = "RACCOMANDATA UNO",
    "RACCOMANDATA_UNO_AR" = "RACCOMANDATA UNO AR",
    "TELEGRAMMA" = "TELEGRAMMA",
}

/**
 * @swagger
 *
 * definitions:
 *   Letter:
 *     type: object
 *     required:
 *       - sender
 *       - recipients
 *       - subject
 *       - kind
 *       - codePdf
 *     properties:
 *       user:
 *         type: string
 *         example: 5c991af86327ba47393f2fb3
 *       sender:
 *         type: string
 *         example: 5c882af86327cf472932f2ls4
 *         description: Sender id
 *       recipients:
 *         type: array
 *         items:
 *           type: string
 *         example: [ "5c882af86327cf472976f2ls4", "5b32481679f2b3215c530eaf", "5c2cdf122bbc2920aa205e64" ]
 *         description: Array of Recipient ids
 *       recipientAR:
 *         type: object
 *         properties:
 *           name:
 *             type: string
 *           surname:
 *             type: string
 *           businessName:
 *             type: string
 *           address:
 *             $ref: "#/definitions/Address"
 *       subject:
 *         type: string
 *         example: Important Campaign!
 *       sendAt:
 *         type: string
 *         example: 2020-02-14 13:00:00
 *         description: Assign a value to schedule this campaign. Anything that can be interpreted as a Date counts, but it's recommended to follow the YYYY-MM-DD HH:mm:ss.SSS format.
 *       kind:
 *         type: string
 *         description: The kind of letter this campaign contains.
 *         enum:
 *           - "LETTERA SEMPLICE"
 *           - "LETTERA PRIORITARIA"
 *           - "RACCOMANDATA"
 *           - "RACCOMANDATA AR"
 *           - "RACCOMANDATA UNO"
 *           - "RACCOMANDATA UNO AR"
 *           - "TELEGRAMMA"
 *       codePdf:
 *         type: string
 *         description: The code used to associate the PDF to this campaign. Get this from the /pdf/upload call.
 *         example: GSK6RNCXHW
 *       text:
 *         type: string
 *         description: Telegram text. Considered if kind is TELEGRAMMA
 *         example: HELLO WORLD
 *       bw:
 *         type: boolean
 *         description: Gray-scale print on Poste - Default is false
 *         example: false
 *       backSide:
 *         type: boolean
 *         description: Print on the paper's backside - Default is true
 *         example: true
 *       notes:
 *         type: string
 *         example: This is my beautiful campaign!
 *       smsText:
 *         type: string
 *         description: Text of the SMS to send (max 160 chars)
 *         example: Example text of SMS!
 *   LetterDocument:
 *     allOf:
 *       - $ref: '#/definitions/Letter'
 *       - type: object
 *         properties:
 *           _id:
 *             type: string
 *             example: 5c991af86327ba47393f2fb3
 *           invoice:
 *             type: string
 *             description: Invoice associated with this letter
 *             example: 5c991af86327ba47393f2fb3
 *           sent:
 *             type: boolean
 *             description: This gets updated to true when the campaign is sent from the CRON. You can't update this field manually.
 *             example: false
 *           paid:
 *             type: boolean
 *             description: True if this letter's invoice was paid correctly.
 *             example: false
 *           error:
 *             type: boolean
 *             description: True if PosteWay couldn't send this letter due to an error
 *             example: false
 *           price:
 *             type: number
 *             description: Price of a single envelope. Calculated based on letter kind and number of recipients.
 *             example: 1.1
 *           posteway:
 *             type: object
 *             description: PosteWay query objects. Gets filled by the Query CRON. You can't update this field or its children manually.
 *           createdAt:
 *             type: string
 *             example: 2019-03-25T18:16:24.892Z
 *           updatedAt:
 *             type: string
 *             example: 2020-01-02T18:16:24.892Z
 */
export interface Letter {
    user?: string | UserDocument
    sender: string | SenderDocument
    recipients: Array<string | RecipientDocument>
    recipientAR?: Person
    subject: string
    sendAt?: Date | string
    kind: LetterKind
    codePdf?: string
    text?: string
    bw?: boolean
    backSide?: boolean
    notes?: string
    telegramShowSenderAddress?: boolean
    smsText?: string
    isRaccomandata?: () => boolean
    isTelegramma?: () => boolean
    getTotalPrice?: () => number
}
export interface LetterDocument extends Letter, Document {
    sent: boolean
    paid?: boolean
    error?: boolean
    invoice?: string | InvoiceDocument
    price?: number
    posteway?: {
        requestId?: string
        orderId?: string
        status?: string
        prices?: PriceResponse
        track?: TrackResponse
        telegram?: {
            text?: string
            price?: {
                words: number
                net: number
                tax: number
                total: number
            }
            tickets?: Array<TelegramTicket>
            status?: Array<{
                id: string
                part: number
                state: string
            }>
        }
    }
    createdAt: Date
    updatedAt: Date
    /** REMOVED IN FAVOR OF POSTEWAY
    stats?: {
        status: number
        dateUploaded?: Date | string
        dateCompleted?: Date | string
        envelopes: Array<{
            recipient: Partial<RecipientDocument>
            id: number
            status: number
            dateUploaded?: Date | string
            dateCompleted?: Date | string
            tracking?: string
        }>
    } */
}
export const letterDecoder: Decoder<Letter> = object({
    user: optional(string()),
    sender: string(),
    recipients: array(string()),
    recipientAR: optional(object({
        name: optional(string()),
        surname: optional(string()),
        businessName: optional(string()),
        notes: optional(string()),
        address: addressDecoder
    })),
    subject: string(),
    sendAt: optional(string()),
    kind: oneOf(
        constant(LetterKind.LETTERA_SEMPLICE),
        constant(LetterKind.LETTERA_PRIORITARIA),
        constant(LetterKind.RACCOMANDATA),
        constant(LetterKind.RACCOMANDATA_AR),
        constant(LetterKind.RACCOMANDATA_UNO),
        constant(LetterKind.RACCOMANDATA_UNO_AR),
        constant(LetterKind.TELEGRAMMA),
    ),
    codePdf: optional(string()),
    text: optional(string()),
    bw: optional(boolean()),
    backSide: optional(boolean()),
    notes: optional(string()),
    telegramShowSenderAddress: optional(boolean()),
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
    recipients: [{
        type: Schema.Types.ObjectId,
        ref: "Recipient",
        required: "Recipients are required.",
    }],
    recipientAR: new Schema({
        name: {
            type: String,
            trim: true,
        },
        surname: {
            type: String,
            trim: true,
        },
        businessName: {
            type: String,
            trim: true,
        },
        address: {
            type: AddressSchema,
            required: "Recipient AR address is required.",
        },
    }),
    subject: {
        type: String,
        required: "Subject is required.",
        maxlength: 50,
        trim: true,
    },
    sendAt: {
        type: Date,
        default: Date.now,
    },
    kind: {
        type: String,
        enum: [
            LetterKind.LETTERA_SEMPLICE,
            LetterKind.LETTERA_PRIORITARIA,
            LetterKind.RACCOMANDATA,
            LetterKind.RACCOMANDATA_AR,
            LetterKind.RACCOMANDATA_UNO,
            LetterKind.RACCOMANDATA_UNO_AR,
            LetterKind.TELEGRAMMA,
        ],
        required: "Letter kind is required.",
    },
    codePdf: {
        type: String,
        required: "PDF code is required.",
    },
    text: {
        type: String,
        maxlength: 8192,
        trim: true,
    },
    smsText: {
        type: String,
        maxlength: 160,
        trim: true,
    },
    bw: {
        type: Boolean,
        default: false,
    },
    backSide: {
        type: Boolean,
        default: true
    },
    notes: {
        type: String,
        maxlength: 500,
        trim: true,
    },
    sent: {
        type: Boolean,
        default: false,
    },
    paid: {
        type: Boolean,
        default: false,
    },
    error: {
        type: Boolean,
        default: false,
    },
    invoice: {
        type: Schema.Types.ObjectId,
        ref: "Invoice",
    },
    price: {
        type: Number,
    },
    posteway: new Schema({
        requestId: String,
        orderId: String,
        status: String,
        prices: Schema.Types.Mixed,
        track: Schema.Types.Mixed,
        telegram: Schema.Types.Mixed,
    }, { _id: false }),
    telegramShowSenderAddress: {
        type: Boolean,
        default: false,
    },
    /** REMOVED IN FAVOR OF POSTEWAY
    stats: new Schema({
        status: Number,
        dateUploaded: Date,
        dateCompleted: Date,
        envelopes: [
            new Schema({
                recipient: RecipientSchema,
                id: Number,
                status: Number,
                dateUploaded: Date,
                dateCompleted: Date,
                tracking: String,
            }, { _id: false })
        ]
    }, { _id: false }), */
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

LetterSchema.methods.isRaccomandata = function() {
    return this.kind !== LetterKind.LETTERA_SEMPLICE && this.kind !== LetterKind.LETTERA_PRIORITARIA && this.kind !== LetterKind.TELEGRAMMA;
};
LetterSchema.methods.isTelegramma = function() {
    return this.kind === LetterKind.TELEGRAMMA;
}
LetterSchema.methods.getTotalPrice = function() {
    return this.price * this.recipients.length;
};

export const LetterModel: Model<LetterDocument> = model("Letter", LetterSchema);
