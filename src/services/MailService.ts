import { provide } from "inversify-binding-decorators";
import { logger } from "@utils/winston";
import { UserDocument } from "@models/UserModel";
import { LetterDocument } from "@models/LetterModel";
import { NoticeDocument } from "@models/NoticeModel";
import { SenderDocument } from "@models/SenderModel";
import { registrationEmail } from "@templates/registration-email";
import { letterErrorEmail } from "@templates/letter-error-email";
import { Resend } from "resend";
import moment from "moment";

@provide(MailService)
export class MailService {

    private readonly resend: Resend | null;
    private readonly fromAddress: string;

    constructor() {
        const apiKey = process.env.RESEND_API_KEY;
        this.fromAddress = process.env.RESEND_FROM_ADDRESS || "";

        if (!apiKey) {
            logger.warn("RESEND_API_KEY non configurato: MailService disattivato.");
            this.resend = null;
            return;
        }
        if (!this.fromAddress) {
            logger.warn("RESEND_FROM_ADDRESS non configurato: MailService disattivato.");
            this.resend = null;
            return;
        }
        this.resend = new Resend(apiKey);
    }

    async sendRegistrationMail(user: UserDocument): Promise<boolean> {
        if (!this.resend) {
            logger.warn(`[MAIL] Skipping registration email a ${user.email}: Resend non configurato.`);
            return false;
        }
        try {
            const rendered = registrationEmail({ username: user.username });
            const res = await this.resend.emails.send({
                from: this.fromAddress,
                to: user.email,
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
            });
            logger.info(`[MAIL] Registration email inviata a ${user.email} (id=${res.id})`);
            return true;
        } catch (err) {
            logger.error("Errore durante l'invio della registration email!", err);
            return false;
        }
    }

    async sendLetterErrorMail(
        user: UserDocument,
        letter: LetterDocument,
        errorNotice: Partial<NoticeDocument>,
        documentUrl: string
    ): Promise<boolean> {
        logger.info(`[LETTER ${letter.codePdf}] Sending letter error email to ${user.username}...`);

        if (!this.resend) {
            logger.warn(`[MAIL] Skipping letter error email a ${user.email}: Resend non configurato.`);
            return false;
        }

        const sender = letter.sender as SenderDocument;
        const senderName = !sender ? "Sconosciuto" : (sender?.businessName ?? sender?.name ?? "Sconosciuto");

        try {
            const rendered = letterErrorEmail({
                username: user.username,
                sender_name: senderName,
                document_url: documentUrl,
                letter: {
                    subject: letter.subject,
                    kind: letter.kind,
                    codePdf: letter.codePdf,
                    sendAt: moment(letter.sendAt).format("DD/MM/YYYY"),
                },
                error: {
                    title: errorNotice.title ?? "Errore sconosciuto",
                    content: errorNotice.content ?? "Non è stato possibile recuperare i dettagli dell'errore.",
                    data: errorNotice.data ? JSON.stringify(errorNotice.data, null, 2) : "Errore sconosciuto",
                },
            });

            const res = await this.resend.emails.send({
                from: this.fromAddress,
                to: user.email,
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
            });
            logger.info(`[LETTER ${letter.codePdf}] Letter error email inviata a ${user.email} (id=${res.id})`);
            return true;
        } catch (err) {
            logger.error("Errore durante l'invio della letter error email!", err);
            return false;
        }
    }

}
