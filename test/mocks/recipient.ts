import faker from "faker";
import { UserDocument } from "@models/UserModel";
import { Recipient } from "@models/RecipientModel";

export function generateMockRecipient(user: string | UserDocument): Recipient {
    return {
        user: user,
        fullName: faker.fake("{{name.firstName}} {{name.lastName}}"),
        address: faker.address.streetAddress(),
        secondaryAddress: faker.address.secondaryAddress(),
        city: faker.address.city(),
        notes: faker.lorem.sentence(),
    }
}
