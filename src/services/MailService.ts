import { provide } from "inversify-binding-decorators";
import { logger } from "@utils/winston";
import { UserDocument } from "@models/UserModel";
import { LetterDocument } from "@models/LetterModel";
import { NoticeDocument } from "@models/NoticeModel";
import { SenderDocument } from "@models/SenderModel";
import sendgrid from "@sendgrid/mail";
import moment from "moment";

@provide(MailService)
export class MailService {

    constructor() {
        sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
    }

    async sendRegistrationMail(user: UserDocument): Promise<boolean> {
        try {
            await sendgrid.send({
                to: user.email,
                from: process.env.SENDGRID_SENDER_ADDRESS,
                templateId: process.env.SENDGRID_REGISTRATION_TEMPLATE,
                dynamicTemplateData: {
                    username: user.username
                },
            });
            return true;
        } catch (err) {
            logger.error("Error while sending registration email!", err);
            err.response && logger.error(err.response.body);
            return false;
        }
    }

    async sendLetterErrorMail(user: UserDocument, letter: LetterDocument, errorNotice: Partial<NoticeDocument>, documentUrl: string) {
        logger.info(`[LETTER ${letter.codePdf}] Sending letter error email to ${user.username}...`);
        const sender = letter.sender as SenderDocument;
        try {
            await sendgrid.send({
                to: user.email,
                from: process.env.SENDGRID_SENDER_ADDRESS,
                templateId: process.env.SENDGRID_LETTER_ERROR_TEMPLATE,
                dynamicTemplateData: {
                    username: user.username,
                    sender_name: !sender ? "Sconosciuto" : (sender?.businessName ?? sender?.name),
                    document_url: documentUrl,
                    letter: {
                        subject: letter.subject,
                        kind: letter.kind,
                        codePdf: letter.codePdf,
                        sendAt: moment(letter.sendAt).format("DD/MM/YYYY")
                    },
                    error: {
                        title: errorNotice.title ?? "Errore sconosciuto",
                        content: errorNotice.content ?? "Non è stato possibile recuperare i dettagli dell'errore.",
                        data: errorNotice.data ? JSON.stringify(errorNotice.data, null, 2) : "Errore sconosciuto",
                    }
                },
            });
            return true;
        } catch (err) {
            logger.error("Error while sending letter error email!", err);
            err.response && logger.error(err.response.body);
            return false;
        }
    }

}
