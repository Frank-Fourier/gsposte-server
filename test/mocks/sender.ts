import faker from "faker";
import { Sender } from "@models/SenderModel";
import { UserDocument } from "@models/UserModel";
import { generateMockAddress } from "./address";

export function generateMockSender(user: string | UserDocument): Sender {
    return {
        user: user,
        name: faker.fake("{{name.firstName}} {{name.lastName}}"),
        description: faker.lorem.sentence(),
        address: generateMockAddress(),
        iva: faker.random.alphaNumeric(11),
        cf: faker.random.alphaNumeric(16),
        email: faker.internet.email(),
        notes: faker.lorem.sentence(),
    }
}
