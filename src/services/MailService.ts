import { provide } from "inversify-binding-decorators";
import sendgrid from "@sendgrid/mail";
import { UserDocument } from "@models/UserModel";
import { logger } from "@utils/winston";
import { LetterDocument } from "@models/LetterModel";
import { NoticeDocument } from "@models/NoticeModel";
import { SenderDocument } from "@models/SenderModel";
import moment from "moment";

@provide(MailService)
export class MailService {

    constructor() {
        sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
    }

    async sendRegistrationMail(user: UserDocument): Promise<boolean> {
        const templateId: string = process.env.SENDGRID_REGISTRATION_TEMPLATE;
        const senderAddress: string = process.env.SENDGRID_SENDER_ADDRESS;

        try {
            await sendgrid.send({
                to: user.email,
                from: senderAddress,
                templateId: templateId,
                dynamicTemplateData: {
                    username: user.username
                },
                trackingSettings: {
                    subscriptionTracking: {
                        enable: false,
                    }
                },
            });
            return true;
        } catch (err) {
            logger.error("Error while sending registration email!", err);
            err.response && logger.error(err.response.body);
            return false;
        }
    }

    async sendLetterErrorMail(user: UserDocument, letter: LetterDocument, errorNotice: Partial<NoticeDocument>) {
        const templateId: string = process.env.SENDGRID_LETTER_ERROR_TEMPLATE;
        const senderAddress: string = process.env.SENDGRID_SENDER_ADDRESS;
        logger.info(`[LETTER ${letter.codePdf}] Sending letter error email to ${user.username}...`);

        const sender = letter.sender as SenderDocument;
        try {
            await sendgrid.send({
                to: user.email,
                from: senderAddress,
                templateId: templateId,
                dynamicTemplateData: {
                    username: user.username,
                    sender_name: !sender ? "Sconosciuto" : (sender?.businessName ?? sender?.name),
                    letter: {
                        ...letter.toObject(),
                        sendAt: moment(letter.sendAt).format("DD/MM/YYYY")
                    },
                    error: {
                        ...errorNotice.toObject(),
                        data: JSON.stringify(errorNotice.data, null, 2),
                    }
                },
                trackingSettings: {
                    subscriptionTracking: {
                        enable: false,
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
