import { UserDocument } from "@models/UserModel";
import { Rubric } from "@models/RubricModel";
import { RecipientDocument } from "@models/RecipientModel";
import faker from "faker";

export function generateMockRubric(user: string | UserDocument, recipients?: Array<string | RecipientDocument>): Rubric {
    return {
        user: user,
        name: faker.fake("{{internet.userName}}'s Test Contacts"),
        recipients: recipients || [],
        notes: faker.lorem.sentence(),
    };
}
