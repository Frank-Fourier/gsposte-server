// @ts-ignore
import faker from "faker/locale/it";
import { UserDocument } from "@models/UserModel";
import { SenderDocument } from "@models/SenderModel";
import { RecipientDocument } from "@models/RecipientModel";
import { Letter } from "@models/LetterModel";
import { LetterType } from "@services/PostelService";

export function generateMockLetter(user: string | UserDocument, sender: string | SenderDocument, recipients: Array<string | RecipientDocument>, codePdf: string): Letter {
    return {
        user: user,
        sender: sender,
        recipients: recipients,
        subject: faker.fake("{{company.companyName}} IMPORTANT TEST LETTERS"),
        kind: LetterType.LETTERA_SEMPLICE,
        codePdf: codePdf,
        density: 150,
        notes: faker.lorem.sentence(),
    };
}
