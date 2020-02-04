import { suite, test, timeout } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { generateSystemUser } from "@utils/system";
import { getSystemUser } from "../test_utils";
import { UserDocument } from "@models/UserModel";
import { LetterType, PostelService, MpxUploadOptions } from "@services/PostelService";
import { SenderService } from "@services/SenderService";
import { RecipientService } from "@services/RecipientService";
import { cleanTestDB } from "@utils/mongo";
import { generateMockSender } from "../mocks/sender";
import { generateMockRecipient } from "../mocks/recipient";
import { PdfService } from "@services/PdfService";
import { generateUUID } from "@utils/random";

/**
 * Since I can't use my fucking own unique EnvelopeID, and Postel doesn't have a test environment (wtf!!!), I will
 * always use this particular one in my tests.
 * Those fucking bastards at Postel can go fuck themselves if they think this is a bad idea.
 */
const ENVELOPE_ID = 876457;

@suite ("PostelService") class PostelServiceTests {

    postel = ioc.resolve(PostelService);
    senderService = ioc.resolve(SenderService);
    recipientService = ioc.resolve(RecipientService);
    pdf = ioc.resolve(PdfService);
    system: UserDocument;

    static async before() { await generateSystemUser(); }
    async before() { this.system = await getSystemUser(); }

    @timeout(60000)
    @test async "Should call the Upload and Query APIs correctly" () {
        const sender = await this.senderService.save(generateMockSender(this.system._id));
        const recipients = [
            await this.recipientService.save(generateMockRecipient(this.system._id)),
            await this.recipientService.save(generateMockRecipient(this.system._id)),
            await this.recipientService.save(generateMockRecipient(this.system._id)),
        ];
        const options: MpxUploadOptions = {
            test: true,
            letterType: LetterType.LETTERA_SEMPLICE,
            setID: `GSTEST_${generateUUID()}`,
            envelopeID: ENVELOPE_ID,
            useSameEnvelopeID: true,
            pdf: {
                numPages: 1,
                base64: await this.pdf.toBase64("test/assets/test.pdf")
            }
        };

        const response = await this.postel.upload(sender, recipients, options);
        expect(response.set.errors).to.be.empty;
        expect(response.pdf.errors).to.be.empty;
        expect(response.envelopes.every(env => env.errors.length === 0)).to.be.true;
        expect(response.indexDeclaration).not.to.exist;

        // Simple test on the query (I can't get specific results for envelopes since I'm using the same ID!)
        const queryResponse = await this.postel.query({
            sets: [{
                id: options.setID,
                wantsRLN: true
            }],
            envelopes: []
        });
        expect(queryResponse.globalCode).to.equal(0);
        expect(queryResponse.queryCode).to.equal(0);
        expect(queryResponse.sets.length).to.equal(1);
        expect(queryResponse.sets[0].code).to.equal(0);
        expect(queryResponse.sets[0].status).to.equal(1);
        expect(queryResponse.sets[0].dateCompleted).to.equal("");
        expect(queryResponse.sets[0].regLetterNote).to.be.null;
    }

    static after() { cleanTestDB(); }

}
