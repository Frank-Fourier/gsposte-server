import { UserDocument } from "@models/UserModel";
import { Document, model, Model, Schema } from "mongoose";
import { Decoder, object, optional, string } from "@mojotech/json-type-validation";
import {
    Address,
    addressDecoder,
    AddressDocument,
    AddressSchema,
    mapAddressToPosteWayAddress
} from "@models/schemas/AddressSchema";
import { Person } from "../posteway";
import { encryptPasswordSync } from "@utils/crypto";
import { TvUser, tvUserDecoder } from "@models/TvUserModel";
import { insert } from "@utils/misc";
import { LetterKind } from "@models/LetterModel";

/**
 * @swagger
 *
 * definitions:
 *   Recipient:
 *     type: object
 *     required:
 *       - fullName
 *       - address
 *     properties:
 *       user:
 *         type: string
 *         example: 5c991af86327ba47393f2fb3
 *       fullName:
 *         type: string
 *         example: Makoto Nijima
 *       address:
 *         $ref: "#/definitions/Address"
 *       tv:
 *         $ref: "#/definitions/TvUser"
 *       notes:
 *         type: string
 *         example: The sister of prosecutor Sae Nijima, and student council president at Shujin. She tries to blackmail the Thieves to force them to change the heart of a Yakuza boss, awakening to her Persona in the process. She is the canonic love interest for the protagonist.
 *       phoneNumber:
 *         type: string
 *         example: 3396635621
 *   RecipientDocument:
 *     allOf:
 *       - $ref: '#/definitions/Recipient'
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
export interface Recipient {
    user?: string | UserDocument
    fullName: string
    address: Address
    tv?: TvUser
    cf?: string
    notes?: string
    phoneNumber?: string
    email?: string
    pec?: string
}
export interface RecipientDocument extends Recipient, Document {
    address: AddressDocument
}
export const recipientDecoder: Decoder<Recipient> = object({
    user: optional(string()),
    fullName: string(),
    address: addressDecoder,
    tv: optional(tvUserDecoder),
    cf: optional(string()),
    notes: optional(string()),
    phoneNumber: optional(string()),
    email: optional(string()),
    pec: optional(string()),
});

export function mapRecipientToPerson(recipient: RecipientDocument, letterKind: LetterKind, notes?: string): Person {
    const fullNameTrimmed = recipient.fullName.trim().replace(/[\s]+/g, " ");
    const hasSpace = fullNameTrimmed.includes(" ");
    return {
        ...insert(hasSpace, {
            name: fullNameTrimmed.substring(fullNameTrimmed.indexOf(" ") + 1) || "",
            surname: fullNameTrimmed.split(" ")[0],
        }, {
            businessName: fullNameTrimmed
        }),
        cf: recipient.cf,
        notes: notes,
        address: mapAddressToPosteWayAddress(recipient.address)
    }
}

export const RecipientSchema = new Schema<Recipient>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: "User is required.",
    },
    fullName: {
        type: String,
        required: "Name is required.",
        maxlength: 44,
        trim: true,
    },
    address: {
        type: AddressSchema,
        required: "Address is required.",
    },
    tv: new Schema<TvUser>({
        username: {
            type: String,
            unique: true,
            sparse: true,
        },
        email: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            lowercase: true,
        },
        password: {
            type: String,
            set: (password: string) => encryptPasswordSync(password),
        },
    }, { _id: false }),
    cf: {
        type: String,
        maxlength: 16,
        trim: true,
        uppercase: true,
    },
    notes: {
        type: String,
        maxlength: 500,
        trim: true,
    },
    phoneNumber: {
        type: String,
        maxlength: 30,
        trim: true,
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 100,
    },
    pec: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 100,
    }
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});

export const RecipientModel: Model<RecipientDocument> = model("Recipient", RecipientSchema);
