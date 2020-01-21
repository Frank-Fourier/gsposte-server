import { Document, model, Model, Schema } from "mongoose";
import { Decoder, object, optional, string } from "@mojotech/json-type-validation";
import { UserDocument } from "@models/UserModel";

/**
 * @swagger
 *
 * definitions:
 *   Sender:
 *     type: object
 *     required:
 *       - user
 *       - name
 *       - description
 *       - address
 *       - city
 *     properties:
 *       name:
 *         type: string
 *         example: Sadayo Kawakami
 *       description:
 *         type: string
 *         example: One of your school teachers, later discovered to have a part-time maid job. She embodies the Temperance arcana.
 *       address:
 *         type: string
 *         example: Via Fake 21
 *       city:
 *         type: string
 *         example: Tokyo
 *       iva:
 *         type: string
 *         example: 06998950726
 *       cf:
 *         type: string
 *         example: RCLGNN99S26C983U
 *       email:
 *         type: string
 *         example: giovanni.orciuolo1999@gmail.com
 *       notes:
 *         type: string
 *         example: Any additional notes you may have for this sender.
 *   SenderDocument:
 *     allOf:
 *       - $ref: '#/definitions/Sender'
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
export interface Sender {
    user?: string | UserDocument
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
    user: optional(string()),
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
        maxlength: 100,
    },
    description: {
        type: String,
        required: "Description is required.",
        maxlength: 500,
    },
    address: {
        type: String,
        required: "Address is required.",
        maxlength: 200,
    },
    city: {
        type: String,
        required: "City is required.",
        maxlength: 100,
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

export const SenderModel: Model<SenderDocument> = model("Sender", SenderSchema);
