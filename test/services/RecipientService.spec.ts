import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { RecipientService } from "@services/RecipientService";
import { MunicipalityModel } from "@models/MunicipalityModel";
import { UserDocument } from "@models/UserModel";
import { RecipientDocument } from "@models/RecipientModel";
import { generateSystemUser } from "@utils/system";
import { assertSameRecipient, getSystemUser } from "../test_utils";
import { generateMockRecipient } from "../mocks/recipient";
import { cleanTestDB } from "@utils/mongo";
// @ts-ignore
import faker from "faker/locale/it";
import fs from "fs";

@suite ("RecipientService") class RecipientServiceTests {

    recipientService = ioc.resolve(RecipientService);
    system: UserDocument;

    static async before() { await generateSystemUser(); }
    async before() { this.system = await getSystemUser(); }

    @test async "Should save recipient" () {
        const mock = generateMockRecipient(this.system._id);

        let recipient: RecipientDocument;
        try {
            recipient = await this.recipientService.save(mock);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSameRecipient(mock, recipient);
    }

    @test async "Should not save recipient with invalid params" () {
        const mock = generateMockRecipient(this.system._id);
        delete mock.user; // One of the required params;

        let recipient: RecipientDocument;
        try {
            recipient = await this.recipientService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("User is required.");
        }

        expect(recipient).not.to.exist;
        mock.user = this.system._id;
        mock.notes = faker.lorem.words(500); // Notes max length is 500

        try {
            recipient = await this.recipientService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Path `notes` (`" + mock.notes + "`) is longer than the maximum allowed length (500).")
        }

        expect(recipient).not.to.exist;
    }

    @test async "Should query recipients" () {
        const saved = await this.recipientService.save(generateMockRecipient(this.system._id));

        let recipient: RecipientDocument;
        try {
            recipient = await this.recipientService.findById(saved._id);
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(saved._id.toString()).to.equal(recipient._id.toString());
        assertSameRecipient(saved, recipient);

        const other = generateMockRecipient(this.system._id);
        other.address = saved.address;
        await this.recipientService.save(other);

        let recipients: RecipientDocument[];
        try {
            // Should find both saved and saved_other if I pass this address
            recipients = await this.recipientService.find({ address: saved.address });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(recipients).to.exist;
        expect(recipients.length).to.equal(2);
    }

    @test async "Should update recipient by id" () {
        const saved = await this.recipientService.save(generateMockRecipient(this.system._id));
        const newName = faker.fake("{{name.firstName}} {{name.lastName}}");

        let updated: RecipientDocument;
        try {
            updated = await this.recipientService.updateById(saved._id, { fullName: newName });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(updated.fullName).to.equal(newName);
    }

    @test async "Should not update recipient with wrong id" () {
        await this.recipientService.save(generateMockRecipient(this.system._id));

        let updated: RecipientDocument;
        try {
            // I should be using saved._id, instead I use system._id so I get an error
            updated = await this.recipientService.updateById(this.system._id, { "address.street": "no fake gang" });
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should not update recipient by id with invalid params" () {
        const saved = await this.recipientService.save(generateMockRecipient(this.system._id));
        const newStreet = faker.lorem.sentence(100); // Address max length is 44

        let updated: RecipientDocument;
        try {
            updated = await this.recipientService.updateById(saved._id, { "address.street": newStreet });
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Path `street` (`" + newStreet + "`) is longer than the maximum allowed length (40).");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should delete recipient by id" () {
        const saved = await this.recipientService.save(generateMockRecipient(this.system._id));

        let deleted: RecipientDocument;
        try {
            deleted = await this.recipientService.deleteById(saved._id);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSameRecipient(saved, deleted);
    }

    @test async "Should not delete recipient with wrong id" () {
        await this.recipientService.save(generateMockRecipient(this.system._id));

        let deleted: RecipientDocument;
        try {
            // I should be using saved._id, instead I use system._id so I get an error
            deleted = await this.recipientService.deleteById(this.system._id);
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(deleted).not.to.exist;
    }

    @test async "Should import recipients from XLSX correctly" () {
        // Import municipalities into test database
        const municipalities = require("../assets/municipalities.json");
        await MunicipalityModel.insertMany(municipalities);

        const xlsx = await fs.promises.readFile("test/assets/import_standard.xlsx");
        const result = await this.recipientService.importFromXLSX(xlsx, this.system.id);
        console.log(JSON.stringify(result, null, 2));
    }

    static after() { cleanTestDB(); }

}
