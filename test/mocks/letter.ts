// @ts-ignore
import faker from "faker/locale/it";
import { UserDocument } from "@models/UserModel";
import { SenderDocument } from "@models/SenderModel";
import { RecipientDocument } from "@models/RecipientModel";
import { Letter } from "@models/LetterModel";
import { LetterType } from "@services/PostelService";
import uuid from "uuid/v4";

export function generateMockLetter(user: string | UserDocument, sender: string | SenderDocument, recipients: Array<string | RecipientDocument>): Letter {
    return {
        user: user,
        sender: sender,
        recipients: recipients,
        subject: faker.fake("{{company.companyName}} IMPORTANT TEST LETTERS"),
        letterType: LetterType.LETTERA_SEMPLICE,
        pdf: {
            pages: 6,
            uuid: uuid(),
        },
        notes: faker.lorem.sentence(),
    };
}
