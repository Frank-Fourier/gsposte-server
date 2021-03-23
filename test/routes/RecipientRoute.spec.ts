import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { ExpressServer } from "@server";
import { RecipientService } from "@services/RecipientService";
import { AuthService } from "@services/AuthService";
import { UserService } from "@services/UserService";
import { generateSystemUser } from "@utils/system";
import { assertSameRecipient, getSystemUser, loginWithSystem } from "../test_utils";
import { generateMockRecipient } from "../mocks/recipient";
import { generateMockUser, saveMockUserAndLogin, userGiovanni } from "../mocks/user";
import { generateMockAddress } from "../mocks/address";
import { cleanTestDB } from "@utils/mongo";
import supertest from "supertest";
// @ts-ignore
import faker from "faker/locale/it";

const API = process.env.API_PATH;

@suite("RecipientRoute") class RecipientRouteTests {

    http = supertest(ioc.resolve(ExpressServer).app);
    token = ""; // system token

    recipientService = ioc.resolve(RecipientService);
    userService = ioc.resolve(UserService);
    authService = ioc.resolve(AuthService);

    static async before() { await generateSystemUser(); }
    async before() { this.token = await loginWithSystem(); }

    @test async "Should create a new recipient associated with system user" () {
        const mockRecipient = generateMockRecipient((await getSystemUser())._id);

        const res = await this.http
            .post(`${API}/recipient`)
            .set("Authorization", this.token)
            .send(mockRecipient)
            .expect(201);

        const recipient = await this.recipientService.findById(res.body._id);
        assertSameRecipient(mockRecipient, recipient);
    }

    @test async "Should not be able to create a recipient for someone else" () {
        const system = await getSystemUser();
        const otherUser = await saveMockUserAndLogin();
        const mockRecipient = generateMockRecipient(system._id);

        const { body } = await this.http
            .post(`${API}/recipient`)
            .set("Authorization", otherUser.token)
            .send(mockRecipient)
            .expect(201);

        // At this point body.user should not be otherUser._id, rather system._id
        expect(body.user).to.equal(otherUser.user._id.toString());
        expect(body.user).not.to.equal(system._id.toString());
    }

    @test async "Should not be able to create a recipient without a token" () {
        await this.http
            .post(`${API}/recipient`)
            .send(generateMockRecipient("bullshit"))
            .expect(401);
    }

    @test async "Should not be able to create a recipient with invalid body" () {
        const mockRecipient = await generateMockRecipient((await getSystemUser())._id);
        delete mockRecipient.address; // Required param

        await this.http
            .post(`${API}/recipient`)
            .set("Authorization", this.token)
            .send(mockRecipient)
            .expect(400);

        mockRecipient.address = generateMockAddress();
        mockRecipient.notes = faker.lorem.sentence(500); // Surpasses char limit

        await this.http
            .post(`${API}/recipient`)
            .set("Authorization", this.token)
            .send(mockRecipient)
            .expect(400);

        mockRecipient.notes = faker.lorem.sentence(10);
        mockRecipient.address.street = faker.lorem.sentence(100); // Surpasses char limit

        await this.http
            .post(`${API}/recipient`)
            .set("Authorization", this.token)
            .send(mockRecipient)
            .expect(400);

        mockRecipient.address.street = faker.address.streetAddress();
        mockRecipient.address.secondary = faker.lorem.sentence(100); // Surpasses char limit

        await this.http
            .post(`${API}/recipient`)
            .set("Authorization", this.token)
            .send(mockRecipient)
            .expect(400);
    }

    @test async "Should query recipients correctly" () {
        const giovanni = await this.userService.save({ ...userGiovanni, active: true });
        const otherUser = await this.userService.save(generateMockUser());

        const tokenGiovanni = await this.authService.login({ usernameOrEmail: giovanni.username, password: userGiovanni.password });

        const mockRecipients = [
            await generateMockRecipient(giovanni._id),
            await generateMockRecipient(giovanni._id),
            await generateMockRecipient(otherUser._id),
        ];
        for (const mr of mockRecipients) await this.recipientService.save(mr);

        let res = await this.http
            .post(`${API}/recipient/query`)
            .set("Authorization", tokenGiovanni)
            .send({
                // Will use default pagination
                query: {
                    address: mockRecipients[0].address
                }
            })
            .expect(200);

        expect(res.body.meta.total).to.equal(1);
        expect(res.body.meta.pages).to.equal(1);
        expect(res.body.docs.length).to.equal(1);
        expect(res.body.docs[0].address).to.eql(mockRecipients[0].address);

        res = await this.http
            .post(`${API}/recipient/query`)
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

    @test async "Should get recipient by id correctly" () {
        const mockUser = await saveMockUserAndLogin();
        const recipient = await this.recipientService.save(generateMockRecipient(mockUser.user._id));

        const { body } = await this.http
            .get(`${API}/recipient/${recipient._id}`)
            .set("Authorization", mockUser.token)
            .send()
            .expect(200);

        assertSameRecipient(recipient, body);

        const mockOtherUser = await saveMockUserAndLogin();

        await this.http
            .get(`${API}/recipient/${recipient._id}`)
            .set("Authorization", mockOtherUser.token)
            .send()
            .expect(403);
    }

    @test async "Should update recipient by id correctly" () {
        const mockUser = await saveMockUserAndLogin();
        const mockRecipient = generateMockRecipient(mockUser.user._id);
        const recipient = await this.recipientService.save(mockRecipient);
        const newStreet = "Via Lezzi 4316";

        const { body } = await this.http
            .put(`${API}/recipient/${recipient._id}`)
            .set("Authorization", mockUser.token)
            .send({
                "address.street": newStreet
            })
            .expect(200);

        recipient.address.street = newStreet; // Align with update
        assertSameRecipient(recipient, body);

        const mockOtherUser = await saveMockUserAndLogin();

        await this.http
            .put(`${API}/recipient/${recipient._id}`)
            .set("Authorization", mockOtherUser.token)
            .send({
                cf: "modified"
            })
            .expect(403);
    }

    static after() { cleanTestDB(); }

}
