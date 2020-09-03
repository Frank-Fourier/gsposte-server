import { UserDocument } from "@models/UserModel";
import { Document, model, Model, Schema } from "mongoose";
import moment from "moment";
import { array, Decoder, number, object, optional, string } from "@mojotech/json-type-validation";
import { ProvisionDocument } from "@models/ProvisionModel";

export interface Revenue {
    user: string | UserDocument
    year?: number
    month?: number
    provisions?: Array<string | ProvisionDocument>
    amount: number
}
export interface RevenueDocument extends Revenue, Document {
}
export const revenueDecoder: Decoder<Revenue> = object({
    user: string(),
    year: optional(number()),
    month: optional(number()),
    provisions: optional(array(string())),
    amount: number(),
});

export const RevenueSchema = new Schema<Revenue>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    year: {
        type: Number,
        default: () => moment().subtract(5, "minutes").year()
    },
    month: {
        type: Number,
        default: () => moment().subtract(5, "minutes").month()
    },
    provisions: [{
        type: Schema.Types.ObjectId,
        ref: "Provisions"
    }],
    amount: {
        type: Number
    }
});

export const RevenueModel: Model<RevenueDocument> = model("Revenue", RevenueSchema);
