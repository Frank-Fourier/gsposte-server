import faker from "faker";
import "faker/locale/it";
import { User } from "@models/UserModel";

export function generateMockUser(): User {
    return {
        username: faker.internet.userName(),
        email: faker.internet.email(),
        password: faker.internet.password()
    };
}

export const userGiovanni: User = {
    username: "GiovanniOr2",
    email: "giovanni.orciuolo1999@gmail.com",
    password: "Expurosion!!!!"
};
