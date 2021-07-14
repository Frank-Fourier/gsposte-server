import { suite, test, timeout } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { UserDocument } from "@models/UserModel";
import { generateSystemUser } from "@utils/system";
import { getSystemUser } from "../test_utils";
import { SmsService } from "@services/SmsService";

@suite ("SmsService") class SmsServiceTests {

    smsService = ioc.resolve(SmsService);
    system: UserDocument;

    static async before() { await generateSystemUser(); }
    async before() { this.system = await getSystemUser(); }

    @test async "Should send SMS correctly" () {
        const { code } = await this.smsService.sendSMS({
            to: "393662616843",
            from: "GSPOSTE",
            text: "Sono un\nserver.gsposte.it/documents/GSDESOESQAYE/original.pdf",
        });
        expect(code).to.equal(200);
    }

}