import { TvUserDocument } from "@models/tv/TvUserModel";
import { Document, model, Model, Schema } from "mongoose";
import { array, Decoder, object, optional, string } from "@mojotech/json-type-validation";
import { UserDocument } from "@models/UserModel";

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
 *       attachments:
 *         type: array
 *         example: [ "https://api.gsposte.it/attachments/bolletta.pdf" ]
 *         description: Array of attachment URLs
 *         items:
 *           type: string
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
export interface TvReport {
    user?: string | UserDocument
    tvUser: string | TvUserDocument
    body: string
    attachments?: Array<string>
}
export interface TvReportDocument extends TvReport, Document {
}
export const tvReportDecoder: Decoder<TvReport> = object({
    user: optional(string()),
    tvUser: string(),
    body: string(),
    attachments: optional(array(string())),
});

export const TvReportSchema = new Schema<TvReport>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: "User is required.",
    },
    tvUser: {
        type: Schema.Types.ObjectId,
        ref: "TvUser",
        required: "TvUser is required.",
    },
    body: {
        type: String,
        required: "Body is required.",
    },
    attachments: [{
        type: String,
        default: []
    }]
});

export const TvReportModel: Model<TvReportDocument> = model("TvReport", TvReportSchema);
