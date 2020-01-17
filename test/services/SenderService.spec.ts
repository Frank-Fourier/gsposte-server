import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { SenderService } from "@services/SenderService";
import { UserDocument } from "@models/UserModel";
import { generateSystemUser } from "@utils/system";
import { assertSameSender, getSystemUser } from "../test_utils";
import { generateMockSender } from "../mocks/sender";
import { SenderDocument } from "@models/SenderModel";
import { cleanTestDB } from "@utils/mongo";
import faker from "faker";
import "faker/locale/it";

@suite ("SenderService") class SenderServiceTests {

    senderService = ioc.resolve(SenderService);
    system: UserDocument;

    static async before() { await generateSystemUser(); }
    async before() { this.system = await getSystemUser(); }

    @test async "Should save sender" () {
        const mock = generateMockSender(this.system._id);
        mock.email = "to trim BAD EMAIL @tiscali.it";

        let sender: SenderDocument;
        try {
            sender = await this.senderService.save(mock);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSameSender(mock, sender);
    }

    @test async "Should not save sender with invalid params" () {
        const mock = generateMockSender(this.system._id);
        delete mock.user; // One of the required params;

        let sender: SenderDocument;
        try {
            sender = await this.senderService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("User is required.");
        }

        expect(sender).not.to.exist;
        mock.user = this.system._id;
        mock.iva = faker.random.alphaNumeric(20); // Partita IVA max length is 11
        mock.cf = faker.random.alphaNumeric(20); // CF max length is 16

        try {
            sender = await this.senderService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Path `iva` (`" + mock.iva + "`) is longer than the maximum allowed length (11). Path `cf` (`" + mock.cf + "`) is longer than the maximum allowed length (16).")
        }

        expect(sender).not.to.exist;
    }

    @test async "Should query senders" () {
        const saved = await this.senderService.save(generateMockSender(this.system._id));

        let sender: SenderDocument;
        try {
            sender = await this.senderService.findById(saved._id);
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(saved._id.toString()).to.equal(sender._id.toString());
        assertSameSender(saved, sender);

        const other = generateMockSender(this.system._id);
        other.cf = saved.cf;
        await this.senderService.save(other);

        let senders: SenderDocument[];
        try {
            // Should find both saved and saved_other if I pass this CF
            senders = await this.senderService.find({ cf: saved.cf });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(senders).to.exist;
        expect(senders.length).to.equal(2);

        try {
            // I should be using saved._id, instead I use system._id so I get an error
            sender = await this.senderService.findById(this.system._id);
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(sender).not.to.exist;
    }

    @test async "Should update sender by id" () {
        const saved = await this.senderService.save(generateMockSender(this.system._id));
        const newName = faker.fake("{{name.firstName}} {{name.lastName}}");

        let updated: SenderDocument;
        try {
            updated = await this.senderService.updateById(saved._id, { name: newName });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(updated.name).to.equal(newName);
    }

    @test async "Should not update sender with wrong id" () {
        await this.senderService.save(generateMockSender(this.system._id));

        let updated: SenderDocument;
        try {
            // I should be using saved._id, instead I use system._id so I get an error
            updated = await this.senderService.updateById(this.system._id, { address: "no fake gang" });
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should not update sender by id with invalid params" () {
        const saved = await this.senderService.save(generateMockSender(this.system._id));
        const newCF = faker.random.alphaNumeric(20); // CF max length is 16

        let updated: SenderDocument;
        try {
            updated = await this.senderService.updateById(saved._id, { cf: newCF });
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Path `cf` (`" + newCF + "`) is longer than the maximum allowed length (16).");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should delete sender by id" () {
        const saved = await this.senderService.save(generateMockSender(this.system._id));

        let deleted: SenderDocument;
        try {
            deleted = await this.senderService.deleteById(saved._id);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSameSender(saved, deleted);
    }

    @test async "Should not delete sender with wrong id" () {
        await this.senderService.save(generateMockSender(this.system._id));

        let deleted: SenderDocument;
        try {
            // I should be using saved._id, instead I use system._id so I get an error
            deleted = await this.senderService.deleteById(this.system._id);
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(deleted).not.to.exist;
    }

    static after() { cleanTestDB(); }

}
