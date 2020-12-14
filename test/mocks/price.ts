// @ts-ignore
import faker from "faker/locale/it";
import { Price } from "@models/PriceModel";
import { LetterKind } from "@models/LetterModel";

export function generateMockPrice(): Price {
    const min = faker.random.number(150);
    return {
        price: faker.random.number(20),
        minWeight: min,
        maxWeight: min + faker.random.number(500),
        kind: LetterKind.RACCOMANDATA,
        extra: faker.random.number(10),
    }
}
