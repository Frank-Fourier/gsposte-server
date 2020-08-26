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

export function generateMockLetter(user: string | UserDocument, sender: string | SenderDocument, recipients: Array<string | RecipientDocument>, codePdf: string, kind?: LetterKind): Letter {
    return {
        user: user,
        sender: sender,
        recipients: recipients,
        subject: faker.fake("{{company.companyName}} IMPORTANT TEST LETTERS"),
        kind: kind || LetterKind.LETTERA_SEMPLICE,
        codePdf: codePdf,
        notes: faker.lorem.sentence(),
    };
}

export async function saveMockLetter(options: { user: string | UserDocument, sender?: string | SenderDocument, recipients?: Array<string | RecipientDocument>, codePdf?: string, sent?: boolean, kind?: LetterKind }) {
    const userId = typeof(options.user) === "object" ? (options.user as UserDocument).id : options.user;
    // THIS SHIT DOESN'T WORK!?!?!?!?
    // const recipients = await Promise.all(
    //    Array(numRecipients).map(async () => await ioc.resolve(RecipientService).save(generateMockRecipient(userId)))
    // );
    const letter = await (await ioc.resolve(LetterService).save(generateMockLetter(
        userId,
        options.sender || (await ioc.resolve(SenderService).save(generateMockSender(userId))).id,
        options.recipients || [
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
        ],
        options.codePdf || TEST_CODE_PDF,
        options.kind || LetterKind.RACCOMANDATA,
    )));
    return await ioc.resolve(LetterService).updateById(letter.id, { $set: { sent: options.sent || false }});
}
