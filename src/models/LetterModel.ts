import { Document, model, Model, Schema } from "mongoose";
import { Decoder, array, object, optional, string, oneOf, constant, number } from "@mojotech/json-type-validation";
import { UserDocument } from "@models/UserModel";
import { LetterType } from "@services/PostelService";
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
 *               setID:
 *                 type: string
 *                 description: The UUID used to identify this set of envelopes within Postel.
 *                 example: B887A8D3-2533-4AA7-9112-43ED8144BA96
 *               baseEnvelopeID:
 *                 type: number
 *                 description: The current value of CustomerEnvelopeID when the sending was done. Used to keep track of values.
 *                 example: 874979
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
    kind: LetterType
    codePdf: string
    density?: number
    notes?: string
}
export interface LetterDocument extends Letter, Document {
    sent: boolean
    postel?: {
        setID: string
        baseEnvelopeID: number
    }
}
export const letterDecoder: Decoder<Letter> = object({
    user: optional(string()),
    sender: string(),
    recipients: array(string()),
    subject: string(),
    sendAt: string(),
    kind: oneOf(
        constant(LetterType.LETTERA_SEMPLICE),
        constant(LetterType.RACCOMANDATA),
        constant(LetterType.RACCOMANDATA_AR),
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
        enum: [ LetterType.LETTERA_SEMPLICE, LetterType.RACCOMANDATA, LetterType.RACCOMANDATA_AR ],
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
            setID: String,
            baseEnvelopeID: Number,
        }, {
            _id: false
        }),
    },
});

export const LetterModel: Model<LetterDocument> = model("Letter", LetterSchema);
