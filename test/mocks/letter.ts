// @ts-ignore
import faker from "faker/locale/it";
import { UserDocument } from "@models/UserModel";
import { SenderDocument } from "@models/SenderModel";
import { RecipientDocument } from "@models/RecipientModel";
import { Letter } from "@models/LetterModel";
import { LetterKind } from "@services/PostelService";
import { generateMockSender } from "./sender";
import { generateMockRecipient } from "./recipient";
import { TEST_CODE_PDF } from "../test_utils";
import { LetterService } from "@services/LetterService";
import { ioc } from "@ioc";
import { SenderService } from "@services/SenderService";
import { RecipientService } from "@services/RecipientService";

export function generateMockLetter(user: string | UserDocument, sender: string | SenderDocument, recipients: Array<string | RecipientDocument>, codePdf: string): Letter {
    return {
        user: user,
        sender: sender,
        recipients: recipients,
        subject: faker.fake("{{company.companyName}} IMPORTANT TEST LETTERS"),
        kind: LetterKind.LETTERA_SEMPLICE,
        codePdf: codePdf,
        density: 150,
        test: true,
        notes: faker.lorem.sentence(),
    };
}

export async function saveMockLetter(user: string | UserDocument, sender?: string | SenderDocument, recipients?: Array<string | RecipientDocument>, codePdf?: string, sent?: boolean) {
    const userId = typeof(user) === "object" ? (user as UserDocument).id : user;
    // THIS SHIT DOESN'T WORK!?!?!?!?
    //const recipients = await Promise.all(
    //    Array(numRecipients).map(async () => await ioc.resolve(RecipientService).save(generateMockRecipient(userId)))
    //);
    const letter = await (await ioc.resolve(LetterService).save(generateMockLetter(
        userId,
        sender || (await ioc.resolve(SenderService).save(generateMockSender(userId))).id,
        recipients || [
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
        ],
        codePdf || TEST_CODE_PDF
    )));
    return await ioc.resolve(LetterService).updateById(letter.id, { $set: { sent: sent || false }});
}
