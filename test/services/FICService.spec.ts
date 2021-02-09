import { test, timeout } from "mocha-typescript";
import { expect } from "chai";
import { generateSystemUser } from "@utils/system";
import { getSystemUser, importPrices, sleep } from "../test_utils";
import { ioc } from "@ioc";
import { InvoiceService } from "@services/InvoiceService";
import { UserDocument } from "@models/UserModel";
import { LetterService } from "@services/LetterService";
import { generateMockSender } from "../mocks/sender";
import { saveMockLetter } from "../mocks/letter";
import { SenderService } from "@services/SenderService";
import { cleanTestDB } from "@utils/mongo";
import { logger } from "@utils/winston";

@suite ("FICService") class FICServiceTests {

    invoiceService = ioc.resolve(InvoiceService);
    senderService = ioc.resolve(SenderService);
    letterService = ioc.resolve(LetterService);
    system: UserDocument;

    static async before() {
        await generateSystemUser();
        await importPrices();
    }
    async before() {
        this.system = await getSystemUser();
        await this.letterService.deleteAll();
        await this.invoiceService.deleteAll();
    }

    @timeout(60000)
    @test async "Should export an invoice to FIC correctly" () {
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        const results = await this.invoiceService.generateInvoices();
        const [{ invoice }] = results[this.system.id];

        try {
            const { fic } = await this.invoiceService.exportToFIC(this.system, invoice);
            expect(fic).to.exist;
        } catch (err) {
            logger.error(err);
            expect(err).not.to.exist;
        }
    }

    @timeout(60000)
    @test async "Should bulk export invoices to FIC correctly" () {
        const [ sender1, sender2, sender3 ] = [
            await this.senderService.save(generateMockSender(this.system.id)),
            await this.senderService.save(generateMockSender(this.system.id)),
            await this.senderService.save(generateMockSender(this.system.id)),
        ];
        await saveMockLetter({ user: this.system.id, sender: sender1.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender1.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender1.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender1.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender1.id, sent: true });

        await saveMockLetter({ user: this.system.id, sender: sender2.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender2.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender2.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender2.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender2.id, sent: true });

        await saveMockLetter({ user: this.system.id, sender: sender3.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender3.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender3.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender3.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender3.id, sent: true });

        await this.invoiceService.generateInvoices();
        this.invoiceService.bulkExportToFIC(this.system, false);
        await sleep(5000);

        const imported = await this.invoiceService.find({ fic: { $exists: true } });
        expect(imported.length).to.equal(3);
    }

    static after() { cleanTestDB(); }

}
