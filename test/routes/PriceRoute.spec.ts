import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { ExpressServer } from "@server";
import { PriceService } from "@services/PriceService";
import { AuthService } from "@services/AuthService";
import { UserService } from "@services/UserService";
import { generateSystemUser } from "@utils/system";
import { assertSamePrice, loginWithSystem } from "../test_utils";
import { generateMockPrice } from "../mocks/price";
import { saveMockUserAndLogin, userGiovanni } from "../mocks/user";
import { cleanTestDB } from "@utils/mongo";
import supertest from "supertest";

const API = process.env.API_PATH;

@suite("PriceRoute") class PriceRouteTests {

    http = supertest(ioc.resolve(ExpressServer).app);
    token = ""; // system token

    priceService = ioc.resolve(PriceService);
    userService = ioc.resolve(UserService);
    authService = ioc.resolve(AuthService);

    static async before() { await generateSystemUser(); }
    async before() { this.token = await loginWithSystem(); }

    @test async "Should create a new price associated with system user" () {
        const mockPrice = generateMockPrice();

        const { body } = await this.http
            .post(`${API}/price`)
            .set("Authorization", this.token)
            .send(mockPrice)
            .expect(201);

        const price = await this.priceService.findById(body._id);
        assertSamePrice(mockPrice, price);
    }

    @test async "Should not be able to create a price if not admin" () {
        const otherUser = await saveMockUserAndLogin();
        const mockPrice = generateMockPrice();

        await this.http
            .post(`${API}/price`)
            .set("Authorization", otherUser.token)
            .send(mockPrice)
            .expect(403);

        await this.http
            .post(`${API}/price`)
            .set("Authorization", this.token)
            .send(mockPrice)
            .expect(201);
    }

    @test async "Should not be able to create a price without a token" () {
        await this.http
            .post(`${API}/price`)
            .send(generateMockPrice())
            .expect(401);
    }

    @test async "Should not be able to create a price with invalid body" () {
        const mockPrice = await generateMockPrice();
        delete mockPrice.price; // Required param

        await this.http
            .post(`${API}/price`)
            .set("Authorization", this.token)
            .send(mockPrice)
            .expect(400);

        mockPrice.maxWeight = -1000; // Max weight must be > 0

        await this.http
            .post(`${API}/price`)
            .set("Authorization", this.token)
            .send(mockPrice)
            .expect(400);
    }

    @test async "Should query prices correctly" () {
        const giovanni = await this.userService.save({ ...userGiovanni, active: true });
        const tokenGiovanni = await this.authService.login({ usernameOrEmail: giovanni.username, password: userGiovanni.password });

        const mockPrices = [
            generateMockPrice(),
            generateMockPrice(),
            generateMockPrice(),
        ];
        for (const mp of mockPrices) await this.priceService.save(mp);

        let res = await this.http
            .post(`${API}/price/query`)
            .set("Authorization", tokenGiovanni)
            .send({
                query: {
                    price: mockPrices[0].price
                }
            })
            .expect(200);

        expect(res.body.meta.total).to.equal(1);
        expect(res.body.meta.pages).to.equal(1);
        expect(res.body.docs.length).to.equal(1);
        expect(res.body.docs[0].price).to.equal(mockPrices[0].price);
    }

    @test async "Should get price by id correctly" () {
        const mockUser = await saveMockUserAndLogin();
        const price = await this.priceService.save(generateMockPrice());

        const { body } = await this.http
            .get(`${API}/price/${price._id}`)
            .set("Authorization", mockUser.token)
            .send()
            .expect(200);

        assertSamePrice(price, body);
    }

    @test async "Should update price by id correctly" () {
        const mockPrice = generateMockPrice();
        const price = await this.priceService.save(mockPrice);

        await this.http
            .post(`${API}/price`)
            .set("Authorization", this.token)
            .send(mockPrice)
            .expect(201);

        const newPrice = 43.16;

        const { body } = await this.http
            .put(`${API}/price/${price._id}`)
            .set("Authorization", this.token)
            .send({
                price: newPrice
            })
            .expect(200);

        price.price = newPrice; // Align with update
        assertSamePrice(price, body);

        const mockOtherUser = await saveMockUserAndLogin();

        await this.http
            .put(`${API}/price/${price._id}`)
            .set("Authorization", mockOtherUser.token)
            .send({
                cf: "modified"
            })
            .expect(403);
    }

    static after() { cleanTestDB(); }

}
