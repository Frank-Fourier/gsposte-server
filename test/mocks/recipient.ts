// @ts-ignore
import faker from "faker/locale/it";
import { UserDocument } from "@models/UserModel";
import { Recipient } from "@models/RecipientModel";
import { generateMockAddress } from "./address";

export function generateMockRecipient(user: string | UserDocument, includePhone?: boolean): Recipient {
    return {
        user: user,
        fullName: faker.fake("{{name.firstName}} {{name.lastName}}"),
        address: generateMockAddress(),
        tv: {
            username: faker.internet.userName(),
            password: faker.internet.password(),
            email: faker.internet.email()
        },
        phoneNumber: includePhone ? faker.phone.phoneNumber() : undefined,
        notes: faker.lorem.sentence(),
    }
}
