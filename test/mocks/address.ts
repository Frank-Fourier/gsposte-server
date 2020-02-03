import { Address } from "@models/schemas/AddressSchema";
import faker from "faker";

export function generateMockAddress(): Address {
    return {
        street: faker.address.streetName(),
        secondary: faker.address.secondaryAddress(),
        city: faker.address.city(),
        zip: "76123",
        province: "BA",
        country: "IT",
    }
}
