// @ts-ignore
import faker from "faker/locale/it";
import { Address } from "@models/schemas/AddressSchema";

export function generateMockAddress(): Address {
    const company = faker.company.companyName();
    return {
        street: faker.address.streetAddress().split(" ").reverse().join(" "),
        secondary: company + (company.includes("SPA") || company.includes("S.R.L.") ? "" : " SPA"),
        city: faker.address.city(),
        zip: faker.address.zipCode(),
        province: faker.address.stateAbbr(),
        country: "IT",
    }
}
