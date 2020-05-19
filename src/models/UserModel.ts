import { model, Model, Schema, Document } from "mongoose";
import { encryptPasswordSync } from "@utils/crypto";
import { array, constant, Decoder, object, oneOf, optional, string } from "@mojotech/json-type-validation";
import uniqueValidator from "mongoose-unique-validator";

export enum UserRoles {
    ROLE_USER = "ROLE_USER",
    ROLE_TV_MANAGER = "ROLE_TV_MANAGER",
    ROLE_ADMIN = "ROLE_ADMIN"
}

/**
 * @swagger
 *
 * definitions:
 *   User:
 *     type: object
 *     required:
 *       - username
 *       - email
 *       - iva
 *       - password
 *     properties:
 *       username:
 *         type: string
 *         example: GiovanniOr2
 *       email:
 *         type: string
 *         example: giovanni.orciuolo1999@gmail.com
 *       password:
 *         type: string
 *         example: OhyaWorstGirl
 *       iva:
 *         type: string
 *         example: 06998950726
 *       referCode:
 *         type: string
 *         description: Referral code (got from someone else)
 *         example: GSK6UJDIUI
 *       roles:
 *         type: array
 *         example: [ "ROLE_USER" ]
 *         items:
 *           type: string
 *           enum:
 *             - "ROLE_USER"
 *             - "ROLE_TV_MANAGER"
 *             - "ROLE_ADMIN"
 *   UserDocument:
 *     allOf:
 *       - $ref: '#/definitions/User'
 *       - type: object
 *         properties:
 *           _id:
 *             type: string
 *             example: 5c991af86327ba47393f2fb3
 *           active:
 *             type: boolean
 *             description: Will be true when the account is activated
 *             example: false
 *           createdAt:
 *             type: string
 *             example: 2019-03-25T18:16:24.892Z
 *           updatedAt:
 *             type: string
 *             example: 2020-01-02T18:16:24.892Z
 */
export interface User {
    username: string
    email: string
    password: string
    iva: string
    referCode?: string
    active?: boolean
    roles?: Array<UserRoles>
    isAdmin?: () => boolean;
    isTvManager?: () => boolean;
}
export interface UserDocument extends User, Document {
}
export const userDecoder: Decoder<User> = object({
    username: string(),
    email: string(),
    password: string(),
    iva: string(),
    referCode: optional(string()),
    roles: optional(array(oneOf(
        constant(UserRoles.ROLE_USER),
        constant(UserRoles.ROLE_TV_MANAGER),
        constant(UserRoles.ROLE_ADMIN)
    ))),
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
 *         example: FistsOfJustice!
 *       newPassword:
 *         type: string
 *         example: TakeOver!
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
    iva: {
        type: String,
        maxlength: 11,
    },
    referCode: {
        type: String,
    },
    active: {
        type: Boolean,
        default: false,
    },
    roles: {
        type: [ String ],
        enum: [ UserRoles.ROLE_USER, UserRoles.ROLE_TV_MANAGER, UserRoles.ROLE_ADMIN ],
        default: [ UserRoles.ROLE_USER ]
    },
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

UserSchema.plugin(uniqueValidator);
UserSchema.methods.isAdmin = function() {
    return this.roles.includes(UserRoles.ROLE_ADMIN);
};
UserSchema.methods.isTvManager = function() {
    return this.roles.includes(UserRoles.ROLE_TV_MANAGER);
};

export const UserModel: Model<UserDocument> = model("User", UserSchema);
