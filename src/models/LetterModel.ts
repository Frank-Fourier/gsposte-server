import { Document, model, Model, Schema } from "mongoose";
import { Decoder, array, object, optional, string, oneOf, constant, number } from "@mojotech/json-type-validation";
import { UserDocument } from "@models/UserModel";
import { LetterKind } from "@services/PostelService";
import { SenderDocument } from "@models/SenderModel";
import { RecipientDocument } from "@models/RecipientModel";

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
 *       subject:
 *         type: string
 *         example: Important Campaign!
 *       sendAt:
 *         type: string
 *         example: 2020-02-14 13:00:00
 *         description: Assign a value to schedule this campaign. Anything that can be interpreted as a Date counts, but it's recommended to follow the YYYY-MM-DD HH:mm:ss.SSS format.
 *       kind:
 *         type: string
 *         description: The kind of letter this campaign contains. Can be "LETTERA SEMPLICE", "RACCOMANDATA" or "RACCOMANDATA AR".
 *         enum:
 *           - "LETTERA SEMPLICE"
 *           - "RACCOMANDATA"
 *           - "RACCOMANDATA AR"
 *       codePdf:
 *         type: string
 *         description: The code used to associate the PDF to this campaign. Get this from the /pdf/upload call.
 *         example: GSK6RNCXHW
 *       density:
 *         type: number
 *         description: The DPI to use when converting the source PDF into Postel PDF. Must be between 150 and 300. Default is 150.
 *         example: 150
 *       notes:
 *         type: string
 *         example: This is my beautiful campaign!
 *   LetterDocument:
 *     allOf:
 *       - $ref: '#/definitions/Letter'
 *       - type: object
 *         properties:
 *           _id:
 *             type: string
 *             example: 5c991af86327ba47393f2fb3
 *           user:
 *             type: string
 *             example: 5e14af210d3e883e729c3dd2
 *           sent:
 *             type: boolean
 *             description: This gets updated to true when the campaign is sent from the CRON. **Do not update this manually!!!**
 *             example: false
 *           postel:
 *             type: object
 *             description: These values are used within Postel and updated by the Postel API. **Do not update these manually!!!**
 *             properties:
 *               baseEnvelopeID:
 *                 type: number
 *                 description: The current value of CustomerEnvelopeID when the sending was done. Used to keep track of values.
 *                 example: 874979
 *               set:
 *                 type: object
 *                 description: The object describing the Set as viewed from Postel
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: CustomerSetID passed to Postel on upload
 *                     example: B887A8D3-2533-4AA7-9112-43ED8144BA96
 *                   status:
 *                     type: number
 *                     description: Postel Status Code. 1 = Approvato. 2 = Lavorazione in corso. 3 = Completato. 4 = Offline. 5 = Da Approvare. 6 = Sospeso. 7 = Annullato.
 *                     example: 1
 *                   dateUploaded:
 *                     type: string
 *                     description: Upload date of this Set (YYYY-MM-DD HH:MM:SS format)
 *                   dateCompleted:
 *                     type: string
 *                     description: Completion date of this Set (YYYY-MM-DD HH:MM:SS format)
 *                   envelopes:
 *                     type: array
 *                     items:
 *                       type: object
 *                       description: Envelopes associated to this Set as viewed from Postel (each Recipient has its Envelope)
 *                       properties:
 *                         id:
 *                           type: number
 *                           description: CustomerEnvelopeID of this Envelope (will be a progressive)
 *                           example: 874979
 *                         status:
 *                           type: number
 *                           description: Postel Status Code. 1 = Approvato. 2 = Lavorazione in corso. 3 = Completato. 4 = Offline. 5 = Da Approvare. 6 = Sospeso. 7 = Annullato.
 *                           example: 1
 *                         dateUploaded:
 *                           type: string
 *                           description: Upload date of this Envelope (YYYY-MM-DD HH:MM:SS format)
 *                         dateCompleted:
 *                           type: string
 *                           description: Completion date of this Envelope (YYYY-MM-DD HH:MM:SS format)
 *                         tracking:
 *                           type: string
 *                           description: Queried and available when the letter kind is "Raccomandata" or "Raccomandata AR". It's used to track the ship status of an Envelope.
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
    subject: string
    sendAt?: Date | string
    kind: LetterKind
    codePdf: string
    density?: number
    notes?: string
}
export interface LetterDocument extends Letter, Document {
    sent: boolean
    postel?: {
        baseEnvelopeID: number
        set: {
            id: string
            status: number
            dateUploaded?: Date | string
            dateCompleted?: Date | string
            envelopes: Array<{
                id: number
                status: number
                dateUploaded?: Date | string
                dateCompleted?: Date | string
                tracking?: string
            }>
        }
    }
}
export const letterDecoder: Decoder<Letter> = object({
    user: optional(string()),
    sender: string(),
    recipients: array(string()),
    subject: string(),
    sendAt: string(),
    kind: oneOf(
        constant(LetterKind.LETTERA_SEMPLICE),
        constant(LetterKind.RACCOMANDATA),
        constant(LetterKind.RACCOMANDATA_AR),
    ),
    codePdf: string(),
    density: optional(number()),
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
    recipients: [{
        type: Schema.Types.ObjectId,
        ref: "Recipient",
        required: "Recipients are required.",
    }],
    subject: {
        type: String,
        required: "Subject is required.",
        maxlength: 100,
    },
    sendAt: {
        type: Date,
        default: Date.now,
    },
    kind: {
        type: String,
        enum: [ LetterKind.LETTERA_SEMPLICE, LetterKind.RACCOMANDATA, LetterKind.RACCOMANDATA_AR ],
        required: "Letter kind is required.",
    },
    codePdf: {
        type: String,
        required: "PDF code is required.",
    },
    density: {
        type: Number,
        default: 150,
        min: 150, max: 300
    },
    notes: {
        type: String,
        maxlength: 500,
    },
    sent: {
        type: Boolean,
        default: false,
    },
    postel: {
        type: new Schema({
            baseEnvelopeID: Number,
            set: new Schema({
                id: String,
                status: Number,
                dateUploaded: Date,
                dateCompleted: Date,
                envelopes: [
                    new Schema({
                        id: Number,
                        status: Number,
                        dateUploaded: Date,
                        dateCompleted: Date,
                        tracking: String,
                    }, { _id: false })
                ]
            }, { _id: false }),
        }, { _id: false }),
    },
});

export const LetterModel: Model<LetterDocument> = model("Letter", LetterSchema);
