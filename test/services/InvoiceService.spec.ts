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
import { mapRecipientToPerson, RecipientDocument } from "@models/RecipientModel";
import { generateUUID } from "@utils/random";
import { LetterDocument, LetterKind } from "@models/LetterModel";
import fs from "fs";
import { RecipientService } from "@services/RecipientService";
import { generateMockRecipient } from "../mocks/recipient";

@suite ("InvoiceService") class InvoiceServiceTests {

    invoiceService = ioc.resolve(InvoiceService);
    letterService = ioc.resolve(LetterService);
    priceService = ioc.resolve(PriceService);
    senderService = ioc.resolve(SenderService);
    recipientService = ioc.resolve(RecipientService);
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

    @test async "Should generate a single invoice correctly" () {
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        const letters = [
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
        ];

        try {
            await this.invoiceService.generateSingleInvoice([
                await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
                await saveMockLetter({ user: this.system.id, sender: (await this.senderService.save(generateMockSender(this.system.id))).id, sent: true }),
            ], await this.invoiceService.getLatestInvoiceNumber() + 1)
        } catch (err) {
            expect(err).to.exist;
        }

        const { invoice, errors } = await this.invoiceService.generateSingleInvoice(
            letters, await this.invoiceService.getLatestInvoiceNumber() + 1
        );

        expect(errors.length).to.equal(0);
        assertSameInvoice({
            user: this.system.id,
            sender: sender.id,
            letters: letters,
            number: 1,
            taxable: 37.5,
            iva: 8.25,
            total: 45.75,
        }, invoice);
    }

    @test async "Should generate invoices for user correctly" () {
        const [ sender1, sender2, sender3 ] = [
            await this.senderService.save(generateMockSender(this.system.id)),
            await this.senderService.save(generateMockSender(this.system.id)),
            await this.senderService.save(generateMockSender(this.system.id)),
        ];
        const firstBatch = [
            await saveMockLetter({ user: this.system.id, sender: sender1.id, sent: true, bw: false }),
            await saveMockLetter({ user: this.system.id, sender: sender1.id, sent: true, bw: false }),
            await saveMockLetter({ user: this.system.id, sender: sender1.id, sent: true, bw: false }),
        ];
        const secondBatch = [
            await saveMockLetter({ user: this.system.id, sender: sender2.id, sent: true, bw: false }),
            await saveMockLetter({ user: this.system.id, sender: sender2.id, sent: true, bw: false }),
        ];
        const thirdBatch = [
            await saveMockLetter({ user: this.system.id, sender: sender3.id, sent: true, bw: false }),
            await saveMockLetter({ user: this.system.id, sender: sender3.id, sent: true, bw: false }),
            await saveMockLetter({ user: this.system.id, sender: sender3.id, sent: true, bw: false }),
            await saveMockLetter({ user: this.system.id, sender: sender3.id, sent: true, bw: false }),
        ];
        const results = await this.invoiceService.generateInvoices();
        results[this.system.id].forEach(r => r.invoice.depopulate("recipients"));

        expect(results[this.system.id].length).to.equal(3);
        expect(results[this.system.id][0].errors.length).to.equal(0);
        assertSameInvoice({
            user: this.system.id,
            sender: sender1.id,
            letters: firstBatch,
            number: 1,
            taxable: 25.5,
            iva: 5.61,
            total: 31.11,
        }, results[this.system.id][0].invoice);
        expect(results[this.system.id][1].errors.length).to.equal(0);
        assertSameInvoice({
            user: this.system.id,
            sender: sender2.id,
            letters: secondBatch,
            number: 2,
            taxable: 17,
            iva: 3.74,
            total: 20.74,
        }, results[this.system.id][1].invoice);
        expect(results[this.system.id][2].errors.length).to.equal(0);
        assertSameInvoice({
            user: this.system.id,
            sender: sender3.id,
            letters: thirdBatch,
            number: 3,
            taxable: 34,
            iva: 7.48,
            total: 41.48,
        }, results[this.system.id][2].invoice);
    }

    @test async "Should not include already paid letters in new invoices" () {
        // First letters and invoice
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true });
        // Will create 1 new invoice
        const [ { invoice } ] = await this.invoiceService.generateInvoicesForUser(this.system.id);

        // The client has now paid this invoice! Wow!
        await this.invoiceService.toggleInvoicePaid(invoice);

        // But wait! Now the client sends another 3 letters with another sender and makes an invoice for them!
        const newSender = await this.senderService.save(generateMockSender(this.system.id));
        const newLetters = [
            await saveMockLetter({ user: this.system.id, sender: newSender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: newSender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: newSender.id, sent: true }),
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
        const saved = await (await saveMockLetter({ user: this.system.id, kind: LetterKind.RACCOMANDATA_AR }))
            .populate("recipients").execPopulate();

        // Emulate the final behaviour of sendLetter()
        const requestId = generateUUID(), orderId = generateUUID().toUpperCase();
        await this.letterService.updateById(saved.id, {
            $set: {
                sent: true,
                price: await this.priceService.calculatePrice(saved),
                posteway: {
                    requestId: requestId,
                    orderId: orderId,
                    prices: {
                        total: 0,
                        details: null,
                    },
                    track: {
                        requestId: requestId,
                        orderStatus: "FAKELETTERSENTFROMTEST",
                        requestStatus: "Mai inviata - TEST",
                        recipients: saved.recipients.map((r: RecipientDocument) => ({
                            person: mapRecipientToPerson(r, saved.kind),
                            tracking: {
                                number: "617845434905",
                                statusCode: "01",
                                description: "consegnato",
                                date: "07/09/2020 00:00:00"
                            }
                        }))
                    },
                }
            }
        }, false, false);

        const letter = await this.letterService.findById(saved.id, { populate: "sender recipients" });
        const pdf = await this.invoiceService.generateLetterInvoicePDF(letter, `test/assets/pdf/${TEST_CODE_PDF}`);
        expect(pdf).to.exist;
    }

    @timeout(60000)
    @test async "Should generate PDF for invoice correctly" () {
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        const letters = [
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
            await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }),
        ];

        const { invoice, errors } = await this.invoiceService.generateSingleInvoice(
            letters, await this.invoiceService.getLatestInvoiceNumber() + 1
        );

        expect(errors.length).to.equal(0);
        const pdf = await this.invoiceService.generateInvoicePDF(invoice);
        expect(pdf).to.exist;
        await fs.promises.writeFile(`test/assets/pdf/invoices/fattooooora.pdf`, pdf);
    }

    @test async "Should add up SMS price to invoice total correctly" () {
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        const letter = await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true, recipients: [
            await this.recipientService.save(generateMockRecipient(this.system.id, true)),
            await this.recipientService.save(generateMockRecipient(this.system.id, false)),
        ], smsText: "CIAO MAMMA" });

        const { invoice, errors } = await this.invoiceService.generateSingleInvoice(
            [ letter ], await this.invoiceService.getLatestInvoiceNumber() + 1
        );

        expect(invoice).to.exist;
        expect(errors.length).to.equal(0);
        expect(invoice.taxable).to.equal(3.15);
    }

    @test async "Should have correct sender name" () {
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        const letters = [ await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }) ];
        const { invoice } = await this.invoiceService.generateSingleInvoice(
            letters, await this.invoiceService.getLatestInvoiceNumber() + 1
        );

        expect(invoice.senderName).to.equal(sender.name);
    }

    @test async "Should update sender name consistently" () {
        const sender = await this.senderService.save(generateMockSender(this.system.id));
        const letters = [ await saveMockLetter({ user: this.system.id, sender: sender.id, sent: true }) ];
        const { invoice: inv } = await this.invoiceService.generateSingleInvoice(
            letters, await this.invoiceService.getLatestInvoiceNumber() + 1
        );

        await this.senderService.updateById(sender.id, { name: "NUOVO NOME" });
        const invoice = await this.invoiceService.findById(inv.id);

        expect(invoice).to.exist;
        expect(invoice.senderName).to.equal("NUOVO NOME");
    }

    static after() { cleanTestDB(); }

}
