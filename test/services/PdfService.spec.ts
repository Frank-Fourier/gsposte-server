import { suite, test, timeout } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { PdfService } from "@services/PdfService";
import { generateMockRecipient } from "../mocks/recipient";
import { generateMockSender } from "../mocks/sender";
import { Types } from "mongoose";
import { logger } from "@utils/winston";
import fs from "fs";

@suite("PdfService") class PdfServiceTests {

    pdf = ioc.resolve(PdfService);

    @timeout(60000)
    @test async "Should format for Postel correctly" () {
        try {
            const mockId = new Types.ObjectId().toHexString();
            const sender = generateMockSender(mockId);
            const recipients = [
                generateMockRecipient(mockId),
                generateMockRecipient(mockId),
                generateMockRecipient(mockId),
            ];

            const base64 = await this.pdf.postelFormat("test/assets/format.pdf", sender, recipients, 150);
            await fs.promises.writeFile("test/assets/format_postel.pdf", Buffer.from(base64, "base64"));
        } catch (err) {
            logger.error(err);
            expect(err).not.to.exist;
        }
    }

}
