import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { RubricService } from "@services/RubricService";
import { RecipientService } from "@services/RecipientService";
import { UserDocument } from "@models/UserModel";
import { RubricDocument } from "@models/RubricModel";
import { RecipientDocument } from "@models/RecipientModel";
import { generateSystemUser } from "@utils/system";
import { assertSameRubric, getSystemUser } from "../test_utils";
import { generateMockRubric } from "../mocks/rubric";
import { generateMockRecipient } from "../mocks/recipient";
import { cleanTestDB } from "@utils/mongo";
// @ts-ignore
import faker from "faker/locale/it";

@suite ("RubricService") class RubricServiceTests {

    rubricService = ioc.resolve(RubricService);
    recipientService = ioc.resolve(RecipientService);
    system: UserDocument;

    static async before() { await generateSystemUser(); }
    async before() { this.system = await getSystemUser(); }

    @test async "Should save rubric" () {
        const mock = generateMockRubric(this.system._id);

        let rubric: RubricDocument;
        try {
            rubric = await this.rubricService.save(mock);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSameRubric(mock, rubric);
    }

    @test async "Should not save rubric with invalid params" () {
        const mock = generateMockRubric(this.system._id);
        delete mock.user; // One of the required params;

        let rubric: RubricDocument;
        try {
            rubric = await this.rubricService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("User is required.");
        }

        expect(rubric).not.to.exist;
        mock.user = this.system._id;
        mock.notes = faker.lorem.words(500); // Notes max length is 500

        try {
            rubric = await this.rubricService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Path `notes` (`" + mock.notes + "`) is longer than the maximum allowed length (500).")
        }

        expect(rubric).not.to.exist;
    }

    @test async "Should query rubrics" () {
        const recipients: string[] = [
            (await this.recipientService.save(generateMockRecipient(this.system._id)))._id.toString(),
            (await this.recipientService.save(generateMockRecipient(this.system._id)))._id.toString(),
            (await this.recipientService.save(generateMockRecipient(this.system._id)))._id.toString(),
        ];
        const saved = await this.rubricService.save(generateMockRubric(this.system._id, recipients));

        let rubric: RubricDocument;
        try {
            rubric = await this.rubricService.findById(saved._id, { populate: "recipients" });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(saved._id.toString()).to.equal(rubric._id.toString());
        expect(saved.name).to.equal(rubric.name);
        // Rubric will have populated recipients
        rubric.recipients.forEach((rec: RecipientDocument) => expect(recipients).to.contain(rec.id));

        const other = generateMockRubric(this.system._id);
        other.name = saved.name;
        await this.rubricService.save(other);

        let rubrics: RubricDocument[];
        try {
            // Should find both saved and saved_other if I pass this name
            rubrics = await this.rubricService.find({ name: saved.name });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(rubrics).to.exist;
        expect(rubrics.length).to.equal(2);
    }

    @test async "Should update rubric by id" () {
        const saved = await this.rubricService.save(generateMockRubric(this.system._id));
        const newName = faker.fake("{{internet.userName}} New Test Rubric Name");

        let updated: RubricDocument;
        try {
            updated = await this.rubricService.updateById(saved._id, { name: newName });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(updated.name).to.equal(newName);
    }

    @test async "Should not update rubric with wrong id" () {
        await this.rubricService.save(generateMockRubric(this.system._id));

        let updated: RubricDocument;
        try {
            // I should be using saved._id, instead I use system._id so I get an error
            updated = await this.rubricService.updateById(this.system._id, { name: "no fake gang" });
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should not update rubric by id with invalid params" () {
        const saved = await this.rubricService.save(generateMockRubric(this.system._id));
        const newName = faker.lorem.sentence(500); // Name max length is 100

        let updated: RubricDocument;
        try {
            updated = await this.rubricService.updateById(saved._id, { name: newName });
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Path `name` (`" + newName + "`) is longer than the maximum allowed length (100).");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should delete rubric by id" () {
        const saved = await this.rubricService.save(generateMockRubric(this.system._id));

        let deleted: RubricDocument;
        try {
            deleted = await this.rubricService.deleteById(saved._id);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSameRubric(saved, deleted);
    }

    @test async "Should not delete rubric with wrong id" () {
        await this.rubricService.save(generateMockRubric(this.system._id));

        let deleted: RubricDocument;
        try {
            // I should be using saved._id, instead I use system._id so I get an error
            deleted = await this.rubricService.deleteById(this.system._id);
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(deleted).not.to.exist;
    }

    static after() { cleanTestDB(); }

}
