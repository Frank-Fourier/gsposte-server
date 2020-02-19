import { Document, model, Model, Schema } from "mongoose";
import { Decoder, object, optional, string, array } from "@mojotech/json-type-validation";
import { UserDocument } from "@models/UserModel";
import { RecipientDocument } from "@models/RecipientModel";

/**
 * @swagger
 *
 * definitions:
 *   Rubric:
 *     type: object
 *     required:
 *       - name
 *     properties:
 *       user:
 *         type: string
 *         example: 5c991af86327ba47393f2fb3
 *       name:
 *         type: string
 *         example: My Contacts
 *       recipients:
 *         type: array
 *         example: [ "5c882af86327cf472976f2ls4", "5b32481679f2b3215c530eaf", "5c2cdf122bbc2920aa205e64" ]
 *         description: Array of Recipient ids
 *       notes:
 *         type: string
 *         example: These are my personal contacts!
 *   RubricDocument:
 *     allOf:
 *       - $ref: '#/definitions/Rubric'
 *       - type: object
 *         properties:
 *           _id:
 *             type: string
 *             example: 5c991af86327ba47393f2fb3
 *           user:
 *             type: string
 *             example: 5e14af210d3e883e729c3dd2
 *           createdAt:
 *             type: string
 *             example: 2019-03-25T18:16:24.892Z
 *           updatedAt:
 *             type: string
 *             example: 2020-01-02T18:16:24.892Z
 */
export interface Rubric {
    user?: string | UserDocument
    name: string
    recipients?: Array<string | RecipientDocument>
    notes?: string
}
export interface RubricDocument extends Rubric, Document {
}
export const rubricDecoder: Decoder<Rubric> = object({
    user: optional(string()),
    name: string(),
    recipients: optional(array(string())),
    notes: optional(string()),
});

export const RubricSchema = new Schema<Rubric>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: "User is required.",
    },
    name: {
        type: String,
        required: "Name is required.",
        maxlength: 100,
    },
    recipients: [{
        type: Schema.Types.ObjectId,
        ref: "Recipient",
        default: []
    }],
    notes: {
        type: String,
        maxlength: 500,
    }
});

export const RubricModel: Model<RubricDocument> = model("Rubric", RubricSchema);
