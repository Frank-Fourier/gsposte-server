import { provide } from "inversify-binding-decorators";
import sendgrid from "@sendgrid/mail";
import { UserDocument } from "@models/UserModel";
import { logger } from "@utils/winston";

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
                }
            });
            return true;
        } catch (err) {
            logger.error("Error while sending registration email!", err);
            err.response && logger.error(err.response.body);
            return false;
        }
    }

}
