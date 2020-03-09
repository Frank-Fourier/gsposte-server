import { suite, test, timeout } from "mocha-typescript";
import { ioc } from "@ioc";
import { InvoiceService } from "@services/InvoiceService";
import { LetterService } from "@services/LetterService";
import { RecipientService } from "@services/RecipientService";
import { SenderService } from "@services/SenderService";
import { PriceService } from "@services/PriceService";
import { generateSystemUser } from "@utils/system";
import { getSystemUser, importPrices } from "../test_utils";
import { UserDocument } from "@models/UserModel";
import { cleanTestDB } from "@utils/mongo";
import { generateMockLetter } from "../mocks/letter";
import { generateMockSender } from "../mocks/sender";
import { generateMockRecipient } from "../mocks/recipient";
import fs from "fs";
import { RecipientDocument } from "@models/RecipientModel";
import { generateUUID } from "@utils/random";

@suite ("InvoiceService") class InvoiceServiceTests {

    invoiceService = ioc.resolve(InvoiceService);
    letterService = ioc.resolve(LetterService);
    senderService = ioc.resolve(SenderService);
    recipientService = ioc.resolve(RecipientService);
    priceService = ioc.resolve(PriceService);
    system: UserDocument;

    static async before() { await generateSystemUser(); }
    async before() { this.system = await getSystemUser(); }

    @timeout(60000)
    @test async "Should generate an invoice correctly" () {
        await importPrices();

         const saved = await (await this.letterService.save(generateMockLetter(
            this.system.id,
            (await this.senderService.save(generateMockSender(this.system.id))).id,
            [
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
                (await this.recipientService.save(generateMockRecipient(this.system.id))).id,
            ],
            "GSTESTPDF21"
        ))).populate("sender recipients").execPopulate();

        // Emulate the final behaviour of batchUploadLetters()
        await this.letterService.updateById(saved.id, {
            $set: {
                sent: true,
                uuid: generateUUID(),
                price: await this.priceService.calculatePrice(saved),
                stats: {
                    status: 0,
                    envelopes: saved.recipients.map((r: RecipientDocument, index) => {
                        return {
                            recipient: r.toObject(),
                            id: parseInt(process.env.CURRENT_ENVELOPE_ID || "420") + index,
                            status: 0
                        }
                    }).sort((a, b) => a.id - b.id)
                }
            }
        }, false, false);

        const letter = await this.letterService.findById(saved.id, { populate: "sender recipients" });
        const pdf = await this.invoiceService.generateInvoice(letter);
        await fs.promises.writeFile("test/assets/pdf/GSTESTPDF21/invoice.pdf", pdf);
    }

    static after() { cleanTestDB(); }

}
