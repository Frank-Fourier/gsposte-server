import { suite, test, timeout } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { RecipientService } from "@services/RecipientService";
import { RubricService } from "@services/RubricService";
import { UserDocument } from "@models/UserModel";
import { RecipientDocument } from "@models/RecipientModel";
import { generateSystemUser } from "@utils/system";
import { assertSameRecipient, getSystemUser, importMunicipalities } from "../test_utils";
import { generateMockRecipient } from "../mocks/recipient";
import { cleanTestDB } from "@utils/mongo";
import fs from "fs";
// @ts-ignore
import faker from "faker/locale/it";

@suite ("RecipientService") class RecipientServiceTests {

    recipientService = ioc.resolve(RecipientService);
    rubricService = ioc.resolve(RubricService);
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

    @timeout(60000)
    @test async "Should import recipients from XLSX correctly" () {
        // Import municipalities into test database
        await importMunicipalities();

        const xlsx_standard = await fs.promises.readFile("test/assets/xlsx/import_standard.xlsx");
        let res = await this.recipientService.importFromXLSX(xlsx_standard, this.system.id, "import_standard.xlsx");

        expect(res.imported.length).to.equal(4);

        expect(res.imported[0].fullName).to.equal("Carmine Conversano");
        expect(res.imported[0].user.toString()).to.equal(this.system.id);
        expect(res.imported[0].address.toObject()).to.eql({
            street: "Via Duca degli Abruzzi 24",
            city: "Andria",
            zip: "76123",
            province: "BT",
            country: "IT"
        });

        expect(res.imported[1].fullName).to.equal("Silvio Troia");
        expect(res.imported[1].user.toString()).to.equal(this.system.id);
        expect(res.imported[1].address.toObject()).to.eql({
            street: "Via Sebastiano 52",
            city: "Acerno",
            zip: "84042",
            province: "SA",
            country: "IT"
        });

        expect(res.errors.length).to.equal(2);
        expect(res.errors[0].row).to.equal(4);
        expect(res.errors[0].description).to.equal("Il CAP 70031 per Andria non corrisponde ad alcun CAP registrato per questo comune.");
        expect(res.errors[1].row).to.equal(5);
        expect(res.errors[1].description).to.equal("Il campo 'Comune' è obbligatorio");

        const xlsx_errors = await fs.promises.readFile("test/assets/xlsx/import_errors.xlsx");
        res = await this.recipientService.importFromXLSX(xlsx_errors, this.system.id, "import_errors.xlsx");

        console.log(JSON.stringify(res, null, 2));
        expect(res.imported.length).to.equal(1);
        expect(res.imported[0].fullName).to.equal("Pop☆Step");
        expect(res.errors.length).to.equal(6);
    }

    @timeout(60000)
    @test async "Should import recipients with rubrics from XLSX correctly" () {
        // Import municipalities into test database
        await importMunicipalities();
        await this.recipientService.deleteAll();

        const silvio = await this.recipientService.save({
            user: this.system.id,
            fullName: "Silvio Troia",
            address: {
                street: "Via Sebastiano 52",
                city: "Acerno",
                zip: "84042",
                province: "SA"
            }
        });

        await this.rubricService.save({
            user: this.system.id,
            name: "Rubrica Esistente",
            recipients: [ silvio.id ]
        });

        const xlsx_standard = await fs.promises.readFile("test/assets/xlsx/import_rubrics.xlsx");
        const res = await this.recipientService.importFromXLSX(xlsx_standard, this.system.id, "import_rubrics.xlsx");
        expect(res.imported.length).to.equal(6);
        expect(res.errors.length).to.equal(0);

        const rubrics = await this.rubricService.findAll();
        expect(rubrics.length).to.equal(3);
        expect(rubrics[0].name).to.equal("Rubrica Esistente");
        expect(rubrics[1].name).to.equal("test rubrica 1");
        expect(rubrics[2].name).to.equal("altra rubrica");

        const [ carmine, silvio_imported, flavio, paolo, fabio, giovanni ] = res.imported;
        expect(silvio_imported.id).to.equal(silvio.id);
        expect(rubrics[0].recipients).to.have.members([ silvio.id, fabio.id ]);
        expect(rubrics[1].recipients).to.have.members([ carmine.id, silvio.id ]);
        expect(rubrics[2].recipients).to.have.members([ flavio.id, paolo.id ]);
        expect(giovanni.id).to.exist;

        // console.log(JSON.stringify(await Promise.all(rubrics.map(r => r.populate("recipients").execPopulate())), null, 2));
    }

    static after() { cleanTestDB(); }

}
