import { suite, test, timeout } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { LetterService } from "@services/LetterService";
import { SenderService } from "@services/SenderService";
import { RecipientService } from "@services/RecipientService";
import { PdfService } from "@services/PdfService";
import { UserDocument } from "@models/UserModel";
import { LetterDocument } from "@models/LetterModel";
import { RecipientDocument } from "@models/RecipientModel";
import { SenderDocument } from "@models/SenderModel";
import { generateSystemUser } from "@utils/system";
import { assertSameLetter, getSystemUser, TEST_CODE_PDF } from "../test_utils";
import { generateMockLetter } from "../mocks/letter";
import { generateMockSender } from "../mocks/sender";
import { generateMockRecipient } from "../mocks/recipient";
import { cleanTestDB } from "@utils/mongo";
import { logger } from "@utils/winston";
// @ts-ignore
import faker from "faker/locale/it";

@suite ("LetterService") class LetterServiceTests {

    letterService = ioc.resolve(LetterService);
    senderService = ioc.resolve(SenderService);
    recipientService = ioc.resolve(RecipientService);
    pdf = ioc.resolve(PdfService);
    system: UserDocument;

    static async before() { await generateSystemUser(); }
    async before() { this.system = await getSystemUser(); }

    @test async "Should save letter" () {
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        const recipients = [
            (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
        ];
        const mock = generateMockLetter(this.system.id, sender.id, recipients, TEST_CODE_PDF);

        let letter: LetterDocument;
        try {
            letter = await this.letterService.save(mock);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSameLetter(mock, letter);
    }

    @test async "Should not save letter with invalid params" () {
        const mock = generateMockLetter(this.system.id,
            await this.senderService.save(generateMockSender(this.system.id)),
            [
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            ],
            TEST_CODE_PDF
        );
        delete mock.user; // One of the required params;

        let letter: LetterDocument;
        try {
            letter = await this.letterService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("User is required.");
        }

        expect(letter).not.to.exist;
        mock.user = this.system.id;
        mock.notes = faker.lorem.words(500); // Notes max length is 500

        try {
            letter = await this.letterService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Path `notes` (`" + mock.notes + "`) is longer than the maximum allowed length (500).")
        }

        expect(letter).not.to.exist;
    }

    @test async "Should query letters" () {
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        const recipients = [
            (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
        ];
        const saved = await this.letterService.save(generateMockLetter(this.system.id, sender, recipients, TEST_CODE_PDF));

        let letter: LetterDocument;
        try {
            letter = await this.letterService.findById(saved.id, { populate: "sender recipients" });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(saved.id.toString()).to.equal(letter.id.toString());
        expect(letter.subject).to.equal(letter.subject);
        // Letter will have populated recipients
        expect((letter.sender as SenderDocument).toObject()).to.eql(sender.toObject());
        letter.recipients.forEach((rec: RecipientDocument) => expect(recipients).to.contain(rec.id));

        const other = generateMockLetter(
            this.system.id,
            (await this.senderService.save(generateMockSender(this.system.id))).id,
            [
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            ],
            TEST_CODE_PDF
        );
        other.subject = saved.subject;
        await this.letterService.save(other);

        let letters: LetterDocument[];
        try {
            // Should find both saved and saved_other if I pass this subject
            letters = await this.letterService.find({ subject: saved.subject });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(letters).to.exist;
        expect(letters.length).to.equal(2);
    }

    @test async "Should update letter by id" () {
        const saved = await this.letterService.save(generateMockLetter(
            this.system.id,
            (await this.senderService.save(generateMockSender(this.system.id))).id,
            [
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            ],
            TEST_CODE_PDF
        ));
        const newSubject = faker.fake("{{internet.userName}} New Test Letter");

        let updated: LetterDocument;
        try {
            updated = await this.letterService.updateById(saved.id, { subject: newSubject });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(updated.subject).to.equal(newSubject);
    }

    @test async "Should not update letter with wrong id" () {
        await this.letterService.save(generateMockLetter(
            this.system.id,
            (await this.senderService.save(generateMockSender(this.system.id))).id,
            [
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            ],
            TEST_CODE_PDF
        ));

        let updated: LetterDocument;
        try {
            // I should be using saved.id, instead I use system.id so I get an error
            updated = await this.letterService.updateById(this.system.id, { subject: "tax tax" });
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should not update letter by id with invalid params" () {
        const saved = await this.letterService.save(generateMockLetter(
            this.system.id,
            (await this.senderService.save(generateMockSender(this.system.id))).id,
            [
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            ],
            TEST_CODE_PDF
        ));
        const newSubject = faker.lorem.sentence(500); // Subject max length is 100

        let updated: LetterDocument;
        try {
            updated = await this.letterService.updateById(saved.id, { subject: newSubject });
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Path `subject` (`" + newSubject + "`) is longer than the maximum allowed length (100).");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should delete letter by id" () {
        const saved = await this.letterService.save(generateMockLetter(
            this.system.id,
            (await this.senderService.save(generateMockSender(this.system.id))).id,
            [
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            ],
            TEST_CODE_PDF
        ));

        let deleted: LetterDocument;
        try {
            deleted = await this.letterService.deleteById(saved.id);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSameLetter(saved, deleted);
    }

    @test async "Should not delete letter with wrong id" () {
        await this.letterService.save(generateMockLetter(
            this.system.id,
            await this.senderService.save(generateMockSender(this.system.id)), [
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            ],
            TEST_CODE_PDF
        ));

        let deleted: LetterDocument;
        try {
            // I should be using saved.id, instead I use system.id so I get an error
            deleted = await this.letterService.deleteById(this.system.id);
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(deleted).not.to.exist;
    }

    @timeout(120000)
    @test async "Should run the upload batch job correctly" () {
        logger.transports.forEach(trans => trans.level = "info");

        const letter = await this.letterService.save(generateMockLetter(
            this.system.id,
            await this.senderService.save(generateMockSender(this.system.id)), [
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            ],
            TEST_CODE_PDF
        ), false);
        await this.pdf.formatAndSavePdf(letter);

        let errors = 0;
        try {
            errors = await this.letterService.batchSendScheduledLetters();
        } catch (err) {
            expect(err).not.to.exist;
        }
        expect(errors).to.equal(0);

        logger.transports.forEach(trans => trans.level = "error");
    }

    static after() { cleanTestDB(); }

}
