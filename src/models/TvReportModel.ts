import { Document, model, Model, Schema } from "mongoose";
import { array, boolean, Decoder, object, optional, string } from "@mojotech/json-type-validation";
import { UserDocument } from "@models/UserModel";
import { Recipient, RecipientDocument } from "@models/RecipientModel";

/**
 * @swagger
 *
 * definitions:
 *   TvReport:
 *     type: object
 *     required:
 *       - tvUser
 *       - body
 *     properties:
 *       user:
 *         type: string
 *         example: 5c991af86327ba47393f2fb3
 *       tvUser:
 *         type: string
 *         example: 5c991af86327ba47393f2fb3
 *       body:
 *         type: string
 *         example: Nuova bolletta da pagare la devi pagare hai capito sì o sì
 *       read:
 *         type: boolean
 *         example: True if this report has been read by the user (default is false)
 *       attachments:
 *         type: array
 *         example: [ { fileName: "Bolletta", filePath: "attachment_bolletta.pdf", mimeType: "application/pdf" } ]
 *         description: Array of attachment files
 *         items:
 *           type: object
 *           required:
 *             - fileName
 *             - filePath
 *             - mimeType
 *           properties:
 *             fileName:
 *               type: string
 *               description: The original file name of this attachment
 *               example: Bolletta
 *             filePath:
 *               type: string
 *               description: The uploaded file path (needs to be concatenated with the full path)
 *               example: attachment_bolletta.pdf
 *             mimeType:
 *               type: string
 *               description: Attachment mime type
 *               example: application/pdf
 *   TvReportDocument:
 *     allOf:
 *       - $ref: '#/definitions/TvReport'
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
export interface TvReportAttachment {
    fileName: string
    filePath: string
    mimeType: string
}
export interface TvReport {
    user?: string | UserDocument
    tvUser: string | RecipientDocument
    body: string
    read?: boolean
    attachments?: Array<TvReportAttachment>
}
export interface TvReportDocument extends TvReport, Document {
}
export const tvReportAttachmentDecoder: Decoder<TvReportAttachment> = object({
    fileName: string(),
    filePath: string(),
    mimeType: string(),
});
export const tvReportDecoder: Decoder<TvReport> = object({
    user: optional(string()),
    tvUser: string(),
    body: string(),
    read: optional(boolean()),
    attachments: optional(array(tvReportAttachmentDecoder)),
});

export const TvReportSchema = new Schema<TvReport>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: "User is required.",
    },
    tvUser: {
        type: Schema.Types.ObjectId,
        ref: "Recipient",
        required: "TvUser is required.",
    },
    body: {
        type: String,
        required: "Body is required.",
        maxlength: 500,
    },
    read: {
        type: Boolean,
        default: false,
    },
    attachments: [{
        type: new Schema<TvReportAttachment>({
            fileName: {
                type: String,
                required: "Attachment file name is required.",
            },
            filePath: {
                type: String,
                required: "Attachment file path is required.",
            },
            mimeType: {
                type: String,
                required: "Attachment mime type is required.",
            }
        }, { _id: false }),
        default: []
    }]
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

export const TvReportModel: Model<TvReportDocument> = model("TvReport", TvReportSchema);
