import { UserDocument } from "@models/UserModel";
import { Document, model, Model, Schema } from "mongoose";
import moment from "moment";
import { Decoder, number, object, optional, string } from "@mojotech/json-type-validation";

export interface Revenue {
    user: string | UserDocument
    year?: number
    month?: number
    amount: number
}
export interface RevenueDocument extends Revenue, Document {
}
export const revenueDecoder: Decoder<Revenue> = object({
    user: string(),
    year: optional(number()),
    month: optional(number()),
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
    amount: {
        type: Number
    }
});

export const RevenueModel: Model<RevenueDocument> = model("Revenue", RevenueSchema);
