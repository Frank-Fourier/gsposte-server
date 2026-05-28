import { UserDocument } from "@models/UserModel";
import { Document, model, Model, Schema } from "mongoose";
import { boolean, constant, Decoder, object, oneOf, optional, string } from "@mojotech/json-type-validation";
import { ws_broadcast, ws_message } from "@utils/websockets";

/**
 * @swagger
 *
 * definitions:
 *   Notice:
 *     type: object
 *     properties:
 *       user:
 *         type: string
 *         description: When created, this user will receive a notification through his WebSocket channel
 *         example: 5c991af86327ba47393f2fb3
 *       title:
 *         type: string
 *         example: Notifica
 *       content:
 *         type: string
 *         example: Corpo della notifica
 *       sender:
 *         type: string
 *         description: Chi ha inviato questa notifica
 *         example: Portale Postale
 *       read:
 *         type: boolean
 *         description: True quando la notifica viene letta dall'utente
 *         example: false
 *       broadcast:
 *         type: boolean
 *         description: True quando la notifica è in modalità broadcast (inviata a tutti gli utenti)
 *       error:
 *         type: boolean
 *         description: True se questa notifica rappresenta un messaggio di errore da comunicare
 *         example: false
 *       kind:
 *         type: string
 *         description: Tipo della notifica. Riguarda strettamente il contenuto della stessa
 *         enum:
 *           - "info"
 *           - "letter"
 *           - "payment"
 *       data:
 *         type: object
 *         description: Oggetto opzionale da allegare a questa notifica
 *   NoticeDocument:
 *     allOf:
 *       - $ref: '#/definitions/Notice'
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
export enum NoticeKind {
    INFO = "info",
    LETTER = "letter",
    PAYMENT = "payment",
    FIC_EXPORT = "fic_export",
}
export interface Notice {
    user?: string | UserDocument
    title?: string
    content: string
    sender?: string
    read?: boolean
    broadcast?: boolean
    error?: boolean
    kind?: NoticeKind
    data?: object
}
export interface NoticeDocument extends Notice, Document {
}
export const NoticeDecoder: Decoder<Notice> = object({
    user: optional(string()),
    title: optional(string()),
    content: string(),
    sender: optional(string()),
    read: optional(boolean()),
    broadcast: optional(boolean()),
    error: optional(boolean()),
    kind: oneOf<NoticeKind>(
        constant(NoticeKind.INFO),
        constant(NoticeKind.LETTER),
        constant(NoticeKind.PAYMENT),
    ),
    data: optional(object()),
});

export const NoticeSchema = new Schema<Notice>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    title: {
        type: String,
        default: "Notifica",
    },
    content: {
        type: String,
        required: "Content is required.",
    },
    sender: {
        type: String,
        default: "Portale Postale",
    },
    read: {
        type: Boolean,
        default: false,
    },
    broadcast: {
        type: Boolean,
        default: false,
    },
    error: {
        type: Boolean,
        default: false,
    },
    kind: {
        type: String,
        enum: [ NoticeKind.INFO, NoticeKind.LETTER, NoticeKind.PAYMENT, NoticeKind.FIC_EXPORT ],
        default: NoticeKind.INFO
    },
    data: {
        type: Schema.Types.Mixed,
        default: {},
    }
}, {
    timestamps: {
        createdAt: true,
        updatedAt: true,
    }
});
NoticeSchema.post("save", (notice: NoticeDocument) => {
    notice.broadcast
        ? ws_broadcast(notice)
        : ws_message(notice.depopulate("user").user.toString(), notice);
});

export const NoticeModel: Model<NoticeDocument> = model("Notice", NoticeSchema);
