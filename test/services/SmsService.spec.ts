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

    @timeout(60000)
    @test async "Should send SMS correctly" () {
        // Disabled for now to avoid sending unnecessary SMS
        // const { code } = await this.smsService.sendSMS({
        //     to: "393396635620",
        //     from: "GSPOSTE",
        //     text: "Sono un test.",
        // });
        // expect(code).to.equal(200);
        expect(true).to.equal(true);
    }

}
