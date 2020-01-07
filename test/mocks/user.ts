import * as faker from "faker";
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
    password: "okokok!"
};
