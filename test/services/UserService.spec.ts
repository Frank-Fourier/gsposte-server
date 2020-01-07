import { expect } from "chai";
import { ioc } from "@ioc";
import { UserService } from "@services/UserService";
import { cleanTestDB } from "@utils/mongo";
import { generateMockUser } from "../mocks/user";
import { UserDocument } from "@models/UserModel";
import { logger } from "@utils/winston";

describe("→ Suite | UserService", () => {

    const userService = ioc.resolve(UserService);
    const mockUser = generateMockUser();
    let dummy: UserDocument;

    it("Should save a new dummy user", async () => {
       try {
           dummy = await userService.save(mockUser);
       } catch (err) {
           logger.error(err);
           expect(err).not.to.exist;
       }
        expect(dummy).to.exist;
        expect(dummy.username).to.equal(mockUser.username);
        expect(dummy.email).to.equal(mockUser.email.toLowerCase());
        expect(dummy.password).not.to.equal(mockUser.password, "!!! PASSWORD WAS NOT HASHED !!!");
        expect(dummy._id).to.exist;
    });

    it("Should not save an exact same dummy user again (no duplicates)", async () => {
        let newUser: UserDocument;
        try {
            newUser = await userService.save(mockUser);
        } catch (err) {
            expect(err).to.exist;
        }
        expect(newUser).not.to.exist;
    });

    after(cleanTestDB);

});
