import { model, Model, Schema, Document } from "mongoose";
import { encryptPasswordSync } from "@utils/crypto";
import { Decoder, number, object, optional, string } from "@mojotech/json-type-validation";
import uniqueValidator from "mongoose-unique-validator";
import { InvoiceModel } from "@models/InvoiceModel";

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
 *       - phone
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
 *       phone:
 *          type: string
 *          example: 3281234567
 *       address:
 *         $ref: "#/definitions/Address"
 *       roles:
 *         type: array
 *         example: [ "ROLE_USER" ]
 *         items:
 *           type: string
 *           enum:
 *             - "ROLE_USER"
 *             - "ROLE_TV_MANAGER"
 *             - "ROLE_ADMIN"
 *       avatar:
 *         type: string
 *         description: Avatar URL
 *       smsName:
 *         type: string
 *         description: Username to send sms
 *         example: 'Carmine'
 *         maxlenght: 11
 *       payoutName:
 *         type: string
 *         description: |
 *           Ragione sociale / nome completo da usare come riferimento per il
 *           payout della admin fee. Se vuoto, viene usato `username`.
 *         example: "Studio Amministrazione Mario Rossi"
 *       payoutFiscalCode:
 *         type: string
 *         description: |
 *           CF o P.IVA dell'amministratore per il payout della admin fee.
 *           Distinto dal campo `iva` (che è il dato usato per la fatturazione
 *           al CLIENTE: lì sta la P.IVA del condominio amministrato).
 *         example: "RSSMRA80A01H501Z"
 *       payoutIban:
 *         type: string
 *         description: IBAN dove versare la admin fee
 *         example: "IT60X0542811101000000123456"
 *       adminFeePercent:
 *         type: number
 *         description: |
 *           Override personale della percentuale di admin fee (0..100, max 2
 *           decimali). Se undefined, eredita `adminFeePercent` dal singleton
 *           globale RevenueShareSetting (default 30%).
 *         example: 25
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
    phone: string
    active?: boolean
    roles?: Array<UserRoles>
    avatar?: string
    smsName?: string
    payoutName?: string
    payoutFiscalCode?: string
    payoutIban?: string
    adminFeePercent?: number
    isAdmin?: () => boolean
    isTvManager?: () => boolean
}
export interface UserDocument extends User, Document {
}
export const userDecoder: Decoder<User> = object({
    username: string(),
    email: string(),
    password: string(),
    iva: string(),
    phone: string(),
    avatar: optional(string()),
    payoutName: optional(string()),
    payoutFiscalCode: optional(string()),
    payoutIban: optional(string()),
    adminFeePercent: optional(number()),
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
        trim: true,
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
        minlength: 11,
        maxlength: 16,
        trim: true,
    },
    phone: {
        type: String,
        minlength: 6,
        maxlength: 13,
        trim: true,
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
    avatar: {
        type: String,
    },
    smsName: {
        type: String,
        trim: true,
        maxlength: 11,
    },
    payoutName: {
        type: String,
        trim: true,
        maxlength: 200,
    },
    payoutFiscalCode: {
        type: String,
        trim: true,
        maxlength: 16,
    },
    payoutIban: {
        type: String,
        trim: true,
        maxlength: 34,
    },
    adminFeePercent: {
        type: Number,
        min: 0,
        max: 100,
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

UserSchema.post("findOneAndUpdate", async function(this: any) {
    const user: UserDocument = await this.model.findOne(this.getQuery());
    if (!user) {
        return;
    }
    await InvoiceModel.updateMany({ user: user.id }, {
        $set: {
            userName: user.username,
        }
    }).exec();
});
