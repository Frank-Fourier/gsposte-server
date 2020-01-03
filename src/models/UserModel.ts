import { model, Model, Schema, Document } from "mongoose";
import { encryptPasswordSync } from "../utils/crypto";
import { Decoder, object, string } from "@mojotech/json-type-validation";
import uniqueValidator from "mongoose-unique-validator";

/**
 * @swagger
 *
 * definitions:
 *   User:
 *     type: object
 *     required:
 *       - username
 *       - email
 *       - password
 *     properties:
 *       username:
 *         type: string
 *         example: GiovanniOr2
 *       email:
 *         type: string
 *         example: giovanniorciuolo1999@gmail.com
 *       password:
 *         type: string
 *         example: okokok!
 *   UserDocument:
 *     allOf:
 *       - $ref: '#/definitions/User'
 *       - type: object
 *         properties:
 *           _id:
 *             type: string
 *             example: 5c991af86327ba47393f2fb3
 *           createdAt:
 *             type: string
 *             example: 2019-03-25T18:16:24.892Z
 */
export interface User {
    username: string
    email: string
    password: string
}
export interface UserDocument extends User, Document {
}
export const userDecoder: Decoder<User> = object({
    username: string(),
    email: string(),
    password: string(),
});

/**
 * @swagger
 *
 * definitions:
 *   UserPasswordUpdate:
 *     type: object
 *     required:
 *       - currentPassword
 *       - newPassword
 *     properties:
 *       currentPassword:
 *         type: string
 *         example: okokok!
 *       newPassword:
 *         type: string
 *         example: uau!
 */
export interface UserPasswordUpdate {
    currentPassword: string;
    newPassword: string;
}
export const userPasswordUpdateDecoder: Decoder<UserPasswordUpdate> = object({
    currentPassword: string(),
    newPassword: string(),
});

export const UserSchema = new Schema<User>({
    username: {
        type: String,
        required: "Username is required",
    },
    email: {
        type: String,
        required: "Email is required",
        unique: true,
        trim: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: "Password is required",
        set: (password: string) => encryptPasswordSync(password),
    },
}, {
    timestamps: {
        createdAt: true,
        updatedAt: false,
    }
});

UserSchema.plugin(uniqueValidator);

export const UserModel: Model<UserDocument> = model("User", UserSchema);
