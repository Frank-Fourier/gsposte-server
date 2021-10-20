// @ts-ignore
import faker from "faker/locale/it";
import { UserDocument } from "@models/UserModel";
import { SenderDocument } from "@models/SenderModel";
import { RecipientDocument } from "@models/RecipientModel";
import { Letter, LetterKind } from "@models/LetterModel";
import { generateMockSender } from "./sender";
import { generateMockRecipient } from "./recipient";
import { TEST_CODE_PDF } from "../test_utils";
import { LetterService } from "@services/LetterService";
import { ioc } from "@ioc";
import { SenderService } from "@services/SenderService";
import { RecipientService } from "@services/RecipientService";

interface GenerateMockLetterParams {
    user: string | UserDocument;
    sender: string | SenderDocument;
    recipients: Array<string | RecipientDocument>;
    codePdf: string;
    kind?: LetterKind;
    bw?: boolean;
    backSide?: boolean;
    smsText?: string;
}

export function generateMockLetter({ user, sender, recipients, codePdf, kind, bw, backSide, smsText }: GenerateMockLetterParams): Letter {
    return {
        user: user,
        sender: sender,
        recipients: recipients,
        subject: faker.lorem.sentence(2),
        kind: kind || LetterKind.LETTERA_SEMPLICE,
        codePdf: codePdf,
        notes: faker.lorem.sentence(),
        bw: bw ?? true,
        backSide: backSide ?? true,
        smsText: smsText
    };
}

export function generateMockTelegram(user: string | UserDocument, sender: string | SenderDocument, recipients: Array<string | RecipientDocument>, text: string): Letter {
    return {
        user: user,
        sender: sender,
        recipients: recipients,
        subject: faker.lorem.words(2),
        kind: LetterKind.TELEGRAMMA,
        text: text,
        notes: faker.lorem.sentence(),
    };
}

export async function saveMockLetter(options: {
    user: string | UserDocument,
    sender?: string | SenderDocument,
    recipients?: Array<string | RecipientDocument>,
    codePdf?: string,
    sent?: boolean,
    kind?: LetterKind,
    smsText?: string,
    bw?: boolean,
    backSide?: boolean,
}) {
    const userId = typeof(options.user) === "object" ? (options.user as UserDocument).id : options.user;
    // THIS SHIT DOESN'T WORK!?!?!?!?
    // const recipients = await Promise.all(
    //    Array(numRecipients).map(async () => await ioc.resolve(RecipientService).save(generateMockRecipient(userId)))
    // );
    const letter = await (await ioc.resolve(LetterService).save(generateMockLetter({
        user: userId,
        sender: options.sender || (await ioc.resolve(SenderService).save(generateMockSender(userId))).id,
        recipients: options.recipients || [
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
            await ioc.resolve(RecipientService).save(generateMockRecipient(userId)),
        ],
        codePdf: options.codePdf || TEST_CODE_PDF,
        kind: options.kind || LetterKind.LETTERA_SEMPLICE,
        smsText: options.smsText,
        bw: options.bw,
        backSide: options.backSide,
    })));
    letter.sent = options.sent ?? false;
    return letter.save();
}
