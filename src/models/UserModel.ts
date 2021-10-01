import { model, Model, Schema, Document } from "mongoose";
import { encryptPasswordSync } from "@utils/crypto";
import { array, Decoder, number, object, optional, string } from "@mojotech/json-type-validation";
import uniqueValidator from "mongoose-unique-validator";
import { generateRandomCode } from "@utils/random";
import { InvoiceModel } from "@models/InvoiceModel";

export enum UserRoles {
    ROLE_USER = "ROLE_USER",
    ROLE_TV_MANAGER = "ROLE_TV_MANAGER",
    ROLE_ADMIN = "ROLE_ADMIN"
}

export interface ProvisionPayment {
    paymentDate: string
    amount: number
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
 *       referFrom:
 *         type: string
 *         description: Referral code (got from someone else)
 *         example: GSC4ZSGQZO
 *       referCode:
 *         type: string
 *         description: Referral code (used to refer other people)
 *         example: GSK6UJDIUI
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
    referFrom?: string
    referCode?: string
    active?: boolean
    roles?: Array<UserRoles>
    avatar?: string
    recipientsGift?: number
    provisionPayments?: Array<ProvisionPayment>
    smsName?: string
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
    referFrom: optional(string()),
    recipientsGift: optional(number()),
    provisionPayments: optional(array(object({
        paymentDate: optional(string()),
        amount: number(),
    }))),
    avatar: optional(string()),
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
    referFrom: {
        type: String,
        trim: true,
    },
    referCode: {
        type: String,
        default: () => `GS${generateRandomCode()}`
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
    recipientsGift: {
        type: Number,
        default: 0,
    },
    smsName: {
        type: String,
        trim: true,
        maxlength: 11,
    },
    provisionPayments: [{
        type: new Schema<ProvisionPayment>({
            paymentDate: {
                type: Date,
                default: Date.now,
            },
            amount: {
                type: Number,
                required: "Payment amount is required.",
            }
        }, { _id: false })
    }],
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
