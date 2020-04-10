import { Document, model, Model, Schema } from "mongoose";
import { Decoder, object, string } from "@mojotech/json-type-validation";
import { encryptPasswordSync } from "@utils/crypto";
import uniqueValidator from "mongoose-unique-validator";

/**
 * @swagger
 *
 * definitions:
 *   TvUser:
 *     type: object
 *     required:
 *       - username
 *       - email
 *       - password
 *     properties:
 *       username:
 *         type: string
 *         example: UtenteTV
 *       email:
 *         type: string
 *         example: silvio.troia@gmail.com
 *       password:
 *         type: string
 *         example: DamnRight
 *   TvUserDocument:
 *     allOf:
 *       - $ref: '#/definitions/TvUser'
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
export interface TvUser {
    username: string
    email: string
    password: string
}
export interface TvUserDocument extends TvUser, Document {
}
export const tvUserDecoder: Decoder<TvUser> = object({
    username: string(),
    email: string(),
    password: string(),
});

export const TvUserSchema = new Schema<TvUser>({
    username: {
        type: String,
        required: "Username is required.",
        unique: true,
    },
    email: {
        type: String,
        required: "Email is required.",
        unique: true,
        trim: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: "Password is required.",
        set: (password: string) => encryptPasswordSync(password),
    },
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

TvUserSchema.plugin(uniqueValidator);

export const TvUserModel: Model<TvUserDocument> = model("TvUser", TvUserSchema);
