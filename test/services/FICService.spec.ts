import { test, timeout } from "mocha-typescript";
import { expect } from "chai";
import { generateSystemUser } from "@utils/system";
import { getSystemUser, importPrices } from "../test_utils";
import { ioc } from "@ioc";
import { InvoiceService } from "@services/InvoiceService";
import { UserDocument } from "@models/UserModel";
import { LetterService } from "@services/LetterService";
import { generateMockSender } from "../mocks/sender";
import { saveMockLetter } from "../mocks/letter";
import { SenderService } from "@services/SenderService";
import { cleanTestDB } from "@utils/mongo";

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

        const { fic } = await this.invoiceService.exportToFIC(invoice);
        console.log(fic);
    }

    static after() { cleanTestDB(); }

}
