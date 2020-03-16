// @ts-ignore
import faker from "faker/locale/it";
import { Address } from "@models/schemas/AddressSchema";

export function generateMockAddress(): Address {
    // Choose a random municipality
    const municipalities = require("../assets/json/municipalities.json") as Array<any>;
    const municipality = municipalities[Math.floor(Math.random() * municipalities.length)];

    const company = faker.company.companyName();
    return {
        street: faker.address.streetAddress().split(" ").reverse().join(" "),
        secondary: company + (company.includes("SPA") || company.includes("S.R.L.") ? "" : " SPA"),
        city: municipality["nome"],
        zip: municipality["cap"][Math.floor(Math.random() * municipality["cap"].length)],
        province: municipality["sigla"],
        country: "IT",
    }
}
