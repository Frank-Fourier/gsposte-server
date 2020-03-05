import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { PriceService } from "@services/PriceService";
import { PriceDocument } from "@models/PriceModel";
import { UserDocument } from "@models/UserModel";
import { generateSystemUser } from "@utils/system";
import { assertSamePrice, getSystemUser } from "../test_utils";
import { generateMockPrice } from "../mocks/price";
import { cleanTestDB } from "@utils/mongo";
// @ts-ignore
import faker from "faker/locale/it";

@suite ("PriceService") class PriceServiceTests {

    priceService = ioc.resolve(PriceService);
    system: UserDocument;

    static async before() { await generateSystemUser(); }
    async before() { this.system = await getSystemUser(); }

    @test async "Should save price" () {
        const mock = generateMockPrice();

        let price: PriceDocument;
        try {
            price = await this.priceService.save(mock);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSamePrice(mock, price);
    }

    @test async "Should not save price with invalid params" () {
        const mock = generateMockPrice();
        delete mock.price; // One of the required params;

        let price: PriceDocument;
        try {
            price = await this.priceService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Price is required.");
        }

        expect(price).not.to.exist;
        mock.price = faker.random.number(100);
        mock.minWeight = -1; // minWeight must be > 0

        try {
            price = await this.priceService.save(mock);
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal('Path `minWeight` (-1) is less than minimum allowed value (0).');
        }

        expect(price).not.to.exist;
    }

    @test async "Should query prices" () {
        const saved = await this.priceService.save(generateMockPrice());

        let price: PriceDocument;
        try {
            price = await this.priceService.findById(saved._id);
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(saved.id).to.equal(price.id);
        expect(saved.price).to.equal(price.price);

        const other = generateMockPrice();
        other.price = saved.price;
        await this.priceService.save(other);

        let prices: PriceDocument[];
        try {
            // Should find both saved and saved_other if I pass this price
            prices = await this.priceService.find({ price: saved.price });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(prices).to.exist;
        expect(prices.length).to.equal(2);
    }

    @test async "Should update price by id" () {
        const saved = await this.priceService.save(generateMockPrice());
        const newPrice = 43.16;

        let updated: PriceDocument;
        try {
            updated = await this.priceService.updateById(saved.id, { price: newPrice });
        } catch (err) {
            expect(err).not.to.exist;
        }

        expect(updated.price).to.equal(newPrice);
    }

    @test async "Should not update price with price not found" () {
        await this.priceService.save(generateMockPrice());

        let updated: PriceDocument;
        try {
            updated = await this.priceService.updateById(this.system._id, { price: 1000 });
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should not update price by id with invalid params" () {
        const saved = await this.priceService.save(generateMockPrice());
        const newPrice = -1500; // Price must be > 0

        let updated: PriceDocument;
        try {
            updated = await this.priceService.updateById(saved.id, { price: newPrice });
        } catch (err) {
            expect(err).to.exist;
            expect(err.message).to.equal("Path `price` (-1500) is less than minimum allowed value (0).");
        }

        expect(updated).not.to.exist;
    }

    @test async "Should delete price by id" () {
        const saved = await this.priceService.save(generateMockPrice());

        let deleted: PriceDocument;
        try {
            deleted = await this.priceService.deleteById(saved._id);
        } catch (err) {
            expect(err).not.to.exist;
        }

        assertSamePrice(saved, deleted);
    }

    @test async "Should not delete price with wrong id" () {
        await this.priceService.save(generateMockPrice());

        let deleted: PriceDocument;
        try {
            // I should be using saved._id, instead I use system._id so I get an error
            deleted = await this.priceService.deleteById(this.system._id);
        } catch (err) {
            expect(err).to.exist;
            expect(err.name).to.equal("NotFoundError");
        }

        expect(deleted).not.to.exist;
    }

    static after() { cleanTestDB(); }

}
