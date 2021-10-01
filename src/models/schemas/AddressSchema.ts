import { Document, Schema } from "mongoose";
import { Decoder, object, optional, string } from "@mojotech/json-type-validation";
import { Address as PosteWayAddress } from "../../posteway";

/**
 * @swagger
 *
 * definitions:
 *   Address:
 *     type: object
 *     required:
 *       - street
 *       - city
 *       - zip
 *       - province
 *     properties:
 *       street:
 *         type: string
 *         description: Street name (max length 44)
 *         example: Aoyama Itchome St.
 *       secondary:
 *         type: string
 *         description: Optional secondary address (max length 44)
 *         example: Shujin Academy
 *       city:
 *         type: string
 *         description: City name (max length 44)
 *         example: Tokyo
 *       zip:
 *         type: string
 *         example: "76123"
 *       province:
 *         type: string
 *         example: BA
 *       country:
 *         type: string
 *         description: Will default to IT if not passed
 *         example: JP
 */
export interface Address {
    street: string
    secondary?: string
    city: string
    zip: string
    province: string
    country?: string
}
export interface AddressDocument extends Address, Document {
}

export const addressDecoder: Decoder<Address> = object({
    street: string(),
    secondary: optional(string()),
    city: string(),
    zip: string(),
    province: string(),
    country: optional(string()),
});

export function mapAddressToPosteWayAddress(address: Address | AddressDocument): PosteWayAddress {
    return {
        kind: "normal",
        street: address.street,
        city: address.city,
        zip: address.zip,
        province: address.province,
        country: address.country
    }
}

export const AddressSchema = new Schema<Address>({
    street: {
        type: String,
        required: "Street is required.",
        maxlength: 44,
        trim: true,
    },
    secondary: {
        type: String,
        maxlength: 44,
        trim: true,
    },
    city: {
        type: String,
        required: "City is required.",
        maxlength: 44,
        trim: true,
    },
    zip: {
        type: String,
        required: "Zip code is required.",
        trim: true,
        minlength: 5, maxlength: 5
    },
    province: {
        type: String,
        required: "Province is required.",
        trim: true,
        minlength: 2, maxlength: 2
    },
    country: {
        type: String,
        default: "ITALY",
        trim: true,
        maxlength: 44,
    }
}, {
    _id: false
});
