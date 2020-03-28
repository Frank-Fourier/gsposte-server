import { suite, test, timeout } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { InvoiceService } from "@services/InvoiceService";
import { LetterService } from "@services/LetterService";
import { PriceService } from "@services/PriceService";
import { SenderService } from "@services/SenderService";
import { generateSystemUser } from "@utils/system";
import { assertSameInvoice, assertSameLetter, getSystemUser, importPrices, TEST_CODE_PDF } from "../test_utils";
import { UserDocument } from "@models/UserModel";
import { cleanTestDB } from "@utils/mongo";
import { saveMockLetter } from "../mocks/letter";
import { generateMockSender } from "../mocks/sender";
import { RecipientDocument } from "@models/RecipientModel";
import { generateUUID } from "@utils/random";
import fs from "fs";
import { LetterDocument } from "@models/LetterModel";

@suite ("InvoiceService") class InvoiceServiceTests {

    invoiceService = ioc.resolve(InvoiceService);
    letterService = ioc.resolve(LetterService);
    priceService = ioc.resolve(PriceService);
    senderService = ioc.resolve(SenderService);
    system: UserDocument;

    static async before() { await generateSystemUser(); await importPrices(); }
    async before() {
        this.system = await getSystemUser();
        await this.letterService.deleteAll();
        await this.invoiceService.deleteAll();
    }

    @test async "Should generate a single invoice correctly" () {
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        const letters = [
            await saveMockLetter(this.system.id, sender.id, null, null, true),
            await saveMockLetter(this.system.id, sender.id, null, null, true),
            await saveMockLetter(this.system.id, sender.id, null, null, true),
            await saveMockLetter(this.system.id, sender.id, null, null, true),
            await saveMockLetter(this.system.id, sender.id, null, null, true),
        ];

        try {
            await this.invoiceService.generateSingleInvoice([
                await saveMockLetter(this.system.id, sender.id, null, null, true),
                await saveMockLetter(this.system.id, (await this.senderService.save(generateMockSender(this.system.id))).id, null, null, true),
            ])
        } catch (err) {
            expect(err).to.exist;
        }

        const { invoice, errors } = await this.invoiceService.generateSingleInvoice(letters);
        invoice.depopulate("recipients");

        expect(errors.length).to.equal(0);
        assertSameInvoice({
            user: this.system.id,
            sender: sender.id,
            letters: letters,
            number: 1,
            taxable: 5.50,
            iva: 1.21,
            total: 6.71,
        }, invoice);
    }

    @test async "Should generate invoices for user correctly" () {
        const [ sender1, sender2 ] = [
            await this.senderService.save(generateMockSender(this.system.id)),
            await this.senderService.save(generateMockSender(this.system.id)),
        ];
        const firstBatch = [
            await saveMockLetter(this.system.id, sender1.id, null, null, true),
            await saveMockLetter(this.system.id, sender1.id, null, null, true),
            await saveMockLetter(this.system.id, sender1.id, null, null, true),
        ];
        const secondBatch = [
            await saveMockLetter(this.system.id, sender2.id, null, null, true),
            await saveMockLetter(this.system.id, sender2.id, null, null, true),
        ];
        const results = await this.invoiceService.generateInvoicesForUser(this.system.id);
        results.forEach(r => r.invoice.depopulate("recipients"));

        expect(results.length).to.equal(2);
        expect(results[0].errors.length).to.equal(0);
        assertSameInvoice({
            user: this.system.id,
            sender: sender1.id,
            letters: firstBatch,
            number: 1,
            taxable: 3.3,
            iva: 0.726,
            total: 4.026,
        }, results[0].invoice);
        expect(results[1].errors.length).to.equal(0);
        assertSameInvoice({
            user: this.system.id,
            sender: sender2.id,
            letters: secondBatch,
            number: 2,
            taxable: 2.2,
            iva: 0.484,
            total: 2.684,
        }, results[1].invoice);
    }

    @test async "Should not include already paid letters in new invoices" () {
        // First letters and invoice
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        await saveMockLetter(this.system.id, sender.id, null, null, true);
        await saveMockLetter(this.system.id, sender.id, null, null, true);
        await saveMockLetter(this.system.id, sender.id, null, null, true);
        await saveMockLetter(this.system.id, sender.id, null, null, true);
        await saveMockLetter(this.system.id, sender.id, null, null, true);
        // Will create 1 new invoice
        const [ { invoice } ] = await this.invoiceService.generateInvoicesForUser(this.system.id);

        // The client has now paid this invoice! Wow!
        await this.invoiceService.markInvoiceAsPaid(invoice);

        // But wait! Now the client sends another 3 letters with another sender and makes an invoice for them!
        const newSender = await this.senderService.save(generateMockSender(this.system.id));
        const newLetters = [
            await saveMockLetter(this.system.id, newSender.id, null, null, true),
            await saveMockLetter(this.system.id, newSender.id, null, null, true),
            await saveMockLetter(this.system.id, newSender.id, null, null, true),
        ];
        newLetters.forEach(l => l.depopulate("user sender recipients"));

        // So now that I make another invoice, this new invoice won't include the already paid letters
        const [ { invoice: newInvoice } ] = await this.invoiceService.generateInvoicesForUser(this.system.id);

        expect(newInvoice.letters.length).to.equal(3);
        assertSameLetter(newLetters[0], newInvoice.letters[0] as LetterDocument);
        assertSameLetter(newLetters[1], newInvoice.letters[1] as LetterDocument);
        assertSameLetter(newLetters[2], newInvoice.letters[2] as LetterDocument);
    }

    @timeout(60000)
    @test async "Should generate a letter invoice PDF correctly" () {
        const saved = await saveMockLetter(this.system.id);

        // Emulate the final behaviour of batchUploadLetters()
        await this.letterService.updateById(saved.id, {
            $set: {
                sent: true,
                uuid: generateUUID(),
                price: await this.priceService.calculatePrice(saved),
                stats: {
                    status: 0,
                    envelopes: saved.recipients.map((r: RecipientDocument, index: number) => {
                        return {
                            recipient: r.toObject(),
                            id: parseInt(process.env.CURRENT_ENVELOPE_ID || "420") + index,
                            status: 0
                        }
                    }).sort((a: any, b: any) => a.id - b.id)
                }
            }
        }, false, false);

        const letter = await this.letterService.findById(saved.id, { populate: "sender recipients" });
        const pdf = await this.invoiceService.generateLetterInvoicePDF(letter);
        await fs.promises.writeFile(`test/assets/pdf/${TEST_CODE_PDF}/invoice.pdf`, pdf);
    }

    static after() { cleanTestDB(); }

}
