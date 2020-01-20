import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { ExpressServer } from "@server";
import { SenderService } from "@services/SenderService";
import { generateSystemUser } from "@utils/system";
import { assertSameSender, getSystemUser, loginWithSystem } from "../test_utils";
import { generateMockSender } from "../mocks/sender";
import { UserService } from "@services/UserService";
import { generateMockUser, saveMockUserAndLogin, userGiovanni } from "../mocks/user";
import { cleanTestDB } from "@utils/mongo";
import supertest from "supertest";
import faker from "faker";
import { AuthService } from "@services/AuthService";

const API = process.env.API_PATH;

@suite("SenderRoute") class SenderRouteTests {

    http = supertest(ioc.resolve(ExpressServer).app);
    token = ""; // system token

    senderService = ioc.resolve(SenderService);
    userService = ioc.resolve(UserService);
    authService = ioc.resolve(AuthService);

    static async before() { await generateSystemUser(); }
    async before() { this.token = await loginWithSystem(); }

    @test async "Should create a new sender associated with system user" () {
        const mockSender = generateMockSender((await getSystemUser())._id);

        const { body } = await this.http
            .post(`${API}/sender`)
            .set("Authorization", this.token)
            .send(mockSender)
            .expect(201);

        const sender = await this.senderService.findById(body._id);
        assertSameSender(mockSender, sender);
    }

    @test async "Should not be able to create a sender for someone else" () {
        const otherUser = await this.userService.save(generateMockUser());
        const mockSender = generateMockSender(otherUser._id);

        const { body } = await this.http
            .post(`${API}/sender`)
            .set("Authorization", this.token)
            .send(mockSender)
            .expect(201);

        // At this point body.user should not be otherUser._id, rather system._id
        expect(body.user).not.to.equal(otherUser._id.toString());
        expect(body.user).to.equal((await getSystemUser())._id.toString());
    }

    @test async "Should not be able to create a sender without a token" () {
        await this.http
            .post(`${API}/sender`)
            .send(generateMockSender("bullshit"))
            .expect(401);
    }

    @test async "Should not be able to create a sender with invalid body" () {
        const mockSender = await generateMockSender((await getSystemUser())._id);
        delete mockSender.city; // Required param

        await this.http
            .post(`${API}/sender`)
            .set("Authorization", this.token)
            .send(mockSender)
            .expect(400);

        mockSender.city = faker.address.city();
        mockSender.cf = faker.random.alphaNumeric(20); // Surpasses char limit

        await this.http
            .post(`${API}/sender`)
            .set("Authorization", this.token)
            .send(mockSender)
            .expect(400);

        mockSender.cf = faker.random.alphaNumeric(16);
        mockSender.iva = faker.random.alphaNumeric(20); // Surpasses char limit

        await this.http
            .post(`${API}/sender`)
            .set("Authorization", this.token)
            .send(mockSender)
            .expect(400);

        mockSender.iva = faker.random.alphaNumeric(11);
        mockSender.notes = faker.random.alphaNumeric(1000); // Surpasses char limit

        await this.http
            .post(`${API}/sender`)
            .set("Authorization", this.token)
            .send(mockSender)
            .expect(400);
    }

    @test async "Should query senders correctly" () {
        const giovanni = await this.userService.save(userGiovanni);
        const otherUser = await this.userService.save(generateMockUser());

        const tokenGiovanni = await this.authService.login({ usernameOrEmail: giovanni.username, password: userGiovanni.password });

        const mockSenders = [
            await generateMockSender(giovanni._id),
            await generateMockSender(giovanni._id),
            await generateMockSender(otherUser._id),
        ];
        for (const ms of mockSenders) await this.senderService.save(ms);

        let res = await this.http
            .get(`${API}/sender`)
            .set("Authorization", tokenGiovanni)
            .send({
                // Will use default pagination
                query: {
                    cf: mockSenders[0].cf
                }
            })
            .expect(200);

        expect(res.body.meta.total).to.equal(1);
        expect(res.body.meta.pages).to.equal(1);
        expect(res.body.docs.length).to.equal(1);
        expect(res.body.docs[0].cf).to.equal(mockSenders[0].cf);

        res = await this.http
            .get(`${API}/sender`)
            .set("Authorization", tokenGiovanni)
            .send({
                // Will use default pagination
                query: {}
            })
            .expect(200);

        expect(res.body.meta.total).to.equal(2);
        expect(res.body.meta.pages).to.equal(1);
        expect(res.body.docs.length).to.equal(2);
        expect(res.body.docs[0].user).to.equal(giovanni._id.toString());
        expect(res.body.docs[1].user).to.equal(giovanni._id.toString());
    }

    @test async "Should get sender by id correctly" () {
        const mockUser = await saveMockUserAndLogin();
        const sender = await this.senderService.save(generateMockSender(mockUser.user._id));

        const { body } = await this.http
            .get(`${API}/sender/${sender._id}`)
            .set("Authorization", mockUser.token)
            .send()
            .expect(200);

        assertSameSender(sender, body);

        const mockOtherUser = await saveMockUserAndLogin();

        await this.http
            .get(`${API}/sender/${sender._id}`)
            .set("Authorization", mockOtherUser.token)
            .send()
            .expect(403);
    }

    @test async "Should update sender by id correctly" () {
        const mockUser = await saveMockUserAndLogin();
        const mockSender = generateMockSender(mockUser.user._id);
        const sender = await this.senderService.save(mockSender);

        await this.http
            .post(`${API}/sender`)
            .set("Authorization", this.token)
            .send(mockSender)
            .expect(201);

        const newCF = "RCLGNN99S26C983U";

        const { body } = await this.http
            .put(`${API}/sender/${sender._id}`)
            .set("Authorization", mockUser.token)
            .send({
                cf: newCF
            })
            .expect(200);

        sender.cf = newCF; // Align with update
        assertSameSender(sender, body);

        const mockOtherUser = await saveMockUserAndLogin();

        await this.http
            .put(`${API}/sender/${sender._id}`)
            .set("Authorization", mockOtherUser.token)
            .send({
                cf: "modified"
            })
            .expect(403);
    }

    static after() { cleanTestDB(); }

}
