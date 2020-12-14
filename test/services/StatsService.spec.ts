import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { StatsService } from "@services/StatsService";
import { cleanTestDB } from "@utils/mongo";
import { generateSystemUser } from "@utils/system";
import { getSystemUser, importMunicipalities, importPrices } from "../test_utils";
import { UserDocument } from "@models/UserModel";
import { saveMockLetter } from "../mocks/letter";
import { logger } from "@utils/winston";
import { LetterKind } from "@models/LetterModel";

@suite ("StatsService") class StatsServiceTests {

    statsService = ioc.resolve(StatsService);
    system: UserDocument;

    static async before() { await generateSystemUser(); }
    async before() { this.system = await getSystemUser(); }

    @test async "Should generate the right statistics" () {
        await importMunicipalities();
        await importPrices();

        await saveMockLetter({ user: this.system.id, kind: LetterKind.LETTERA_SEMPLICE });
        await saveMockLetter({ user: this.system.id, kind: LetterKind.RACCOMANDATA });
        await saveMockLetter({ user: this.system.id, kind: LetterKind.RACCOMANDATA_AR });

        try {
            const stats = await this.statsService.fetchStats(this.system.id);
            expect(stats).to.exist;
        } catch (err) {
            logger.info(err);
            expect(err).not.to.exist;
        }
    }

    static after() { cleanTestDB(); }

}
