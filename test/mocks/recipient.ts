import faker from "faker";
import { UserDocument } from "@models/UserModel";
import { Recipient } from "@models/RecipientModel";
import { generateMockAddress } from "./address";

export function generateMockRecipient(user: string | UserDocument): Recipient {
    return {
        user: user,
        fullName: faker.fake("{{name.firstName}} {{name.lastName}}"),
        address: generateMockAddress(),
        notes: faker.lorem.sentence(),
    }
}
