// @ts-ignore
import faker from "faker/locale/it";
import { Sender } from "@models/SenderModel";
import { UserDocument } from "@models/UserModel";
import { generateMockAddress } from "./address";

export function generateMockSender(user: string | UserDocument): Sender {
    const company = faker.company.companyName();
    return {
        user: user,
        name: faker.fake("{{name.firstName}} {{name.lastName}}"),
        description: faker.lorem.sentence(),
        address: generateMockAddress(),
        addressBill: generateMockAddress(),
        iva: faker.random.alphaNumeric(11),
        cf: faker.random.alphaNumeric(16),
        email: faker.internet.email(),
        businessName: company + (company.includes("SPA") || company.includes("S.R.L.") ? "" : " SPA"),
        invoiceCode: faker.random.alphaNumeric(5),
        notes: faker.lorem.sentence(),
    }
}
