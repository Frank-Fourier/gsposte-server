import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { cleanTestDB } from "@utils/mongo";
import { UserService } from "@services/UserService";
import { ProvisionService } from "@services/ProvisionService";
import { generateSystemUser } from "@utils/system";
import { logger } from "@utils/winston";
import { generateMockUser } from "../mocks/user";
import { saveMockLetter } from "../mocks/letter";
import { UserDocument } from "@models/UserModel";
import { importPrices } from "../test_utils";

@suite ("ProvisionService") class ProvisionServiceTests {

    userService = ioc.resolve(UserService);
    provisionService = ioc.resolve(ProvisionService);

    userA: UserDocument;
    userB1: UserDocument;
    userC1B1: UserDocument; userC2B1: UserDocument;
    userB2: UserDocument;
    userC1B2: UserDocument; userC2B2: UserDocument;

    static async before() {
        await generateSystemUser();
        await importPrices();
    }
    static after() { cleanTestDB(); }

    async generateUsers() {
        this.userA = await this.userService.save(generateMockUser());
        this.userB1 = await this.userService.save(generateMockUser(this.userA.referCode));
        this.userB2 = await this.userService.save(generateMockUser(this.userA.referCode));
        this.userC1B1 = await this.userService.save(generateMockUser(this.userB1.referCode));
        this.userC2B1 = await this.userService.save(generateMockUser(this.userB1.referCode));
        this.userC1B2 = await this.userService.save(generateMockUser(this.userB2.referCode));
        this.userC2B2 = await this.userService.save(generateMockUser(this.userB2.referCode));
    }

    @test async "Should generate provision correctly" () {
        try {
            await this.generateUsers();

            const letter = await saveMockLetter({ user: this.userC2B1.id });
            let provision = await this.provisionService.generateProvision(letter);

            expect(provision.referrers.length).to.equal(3);
            expect((provision.referrers[0].user as UserDocument).id).to.equal(this.userC2B1.id);
            expect((provision.referrers[1].user as UserDocument).id).to.equal(this.userB1.id);
            expect((provision.referrers[2].user as UserDocument).id).to.equal(this.userA.id);

            expect(provision.spent).to.equal(5.5);
            expect(provision.revenue).to.equal(0.75);
            expect(provision.referrers[0].amount).to.equal(0.6);
            expect(provision.referrers[1].amount).to.equal(0.075);
            expect(provision.referrers[2].amount).to.equal(0.075);
            expect(provision.referrers[0].percent).to.equal(80);
            expect(provision.referrers[1].percent).to.equal(10);
            expect(provision.referrers[2].percent).to.equal(10);
        } catch (err) {
            logger.error(err);
            expect(err).not.to.exist;
        }
    }

    @test async "Should calculate provision revenues by user correctly" () {
        try {
            await this.generateUsers();

            // FULL TREE
            const letterA = await saveMockLetter({ user: this.userA.id });
            const letterB1 = await saveMockLetter({ user: this.userB1.id });
            const letterB2 = await saveMockLetter({ user: this.userB2.id });
            const letterC1B1 = await saveMockLetter({ user: this.userC1B1.id });
            const letterC2B1 = await saveMockLetter({ user: this.userC2B1.id });
            const letterC1B2 = await saveMockLetter({ user: this.userC1B2.id });
            const letterC2B2 = await saveMockLetter({ user: this.userC2B2.id });

            const provisionA = await this.provisionService.generateProvision(letterA);
            const provisionB1 = await this.provisionService.generateProvision(letterB1);
            const provisionB2 = await this.provisionService.generateProvision(letterB2);
            const provisionC1B1 = await this.provisionService.generateProvision(letterC1B1);
            const provisionC2B1 = await this.provisionService.generateProvision(letterC2B1);
            const provisionC1B2 = await this.provisionService.generateProvision(letterC1B2);
            const provisionC2B2 = await this.provisionService.generateProvision(letterC2B2);

            const revenue = await this.provisionService.calculateRevenue(this.userA.id);
            expect(revenue.amount).to.equal(
                provisionA.referrers[0].amount
                + provisionB1.referrers[1].amount
                + provisionB2.referrers[1].amount
                + provisionC1B1.referrers[2].amount
                + provisionC2B1.referrers[2].amount
                + provisionC1B2.referrers[2].amount
                + provisionC2B2.referrers[2].amount
            );
        } catch (err) {
            logger.error(err);
            expect(err).not.to.exist;
        }
    }

    @test async "Should calculate provision revenues by user yearly correctly" () {
        try {
            await this.generateUsers();

            // FULL TREE
            const letterA = await saveMockLetter({ user: this.userA.id });
            const letterB1 = await saveMockLetter({ user: this.userB1.id });
            const letterB2 = await saveMockLetter({ user: this.userB2.id });
            const letterC1B1 = await saveMockLetter({ user: this.userC1B1.id });
            const letterC2B1 = await saveMockLetter({ user: this.userC2B1.id });
            const letterC1B2 = await saveMockLetter({ user: this.userC1B2.id });
            const letterC2B2 = await saveMockLetter({ user: this.userC2B2.id });

            await this.provisionService.generateProvision(letterA);
            await this.provisionService.generateProvision(letterB1);
            await this.provisionService.generateProvision(letterB2);
            await this.provisionService.generateProvision(letterC1B1);
            await this.provisionService.generateProvision(letterC2B1);
            await this.provisionService.generateProvision(letterC1B2);
            await this.provisionService.generateProvision(letterC2B2);

            const { year, provisions } = await this.provisionService.calculateRevenueYearly(this.userA.id);
            expect(provisions.length).to.equal(7);
            expect(year).to.equal(new Date().getFullYear());
        } catch (err) {
            logger.error(err);
            expect(err).not.to.exist;
        }
    }

    @test async "Should calculate provision revenues by user monthly correctly" () {
        try {
            await this.generateUsers();

            // FULL TREE
            const letterA = await saveMockLetter({ user: this.userA.id });
            const letterB1 = await saveMockLetter({ user: this.userB1.id });
            const letterB2 = await saveMockLetter({ user: this.userB2.id });
            const letterC1B1 = await saveMockLetter({ user: this.userC1B1.id });
            const letterC2B1 = await saveMockLetter({ user: this.userC2B1.id });
            const letterC1B2 = await saveMockLetter({ user: this.userC1B2.id });
            const letterC2B2 = await saveMockLetter({ user: this.userC2B2.id });

            await this.provisionService.generateProvision(letterA);
            await this.provisionService.generateProvision(letterB1);
            await this.provisionService.generateProvision(letterB2);
            await this.provisionService.generateProvision(letterC1B1);
            await this.provisionService.generateProvision(letterC2B1);
            await this.provisionService.generateProvision(letterC1B2);
            await this.provisionService.generateProvision(letterC2B2);

            const months = await this.provisionService.calculateRevenuesMonthly(this.userA.id, new Date().getFullYear());
            expect(months).to.exist;

            console.log(JSON.stringify(months, null, 4));
        } catch (err) {
            logger.error(err);
            expect(err).not.to.exist;
        }
    }

}
