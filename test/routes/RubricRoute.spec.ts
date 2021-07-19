import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { ExpressServer } from "@server";
import { RubricService } from "@services/RubricService";
import { AuthService } from "@services/AuthService";
import { UserService } from "@services/UserService";
import { RecipientService } from "@services/RecipientService";
import { generateSystemUser } from "@utils/system";
import { assertSameRubric, getSystemUser, loginWithSystem } from "../test_utils";
import { generateMockRubric } from "../mocks/rubric";
import { generateMockUser, saveMockUserAndLogin, userGiovanni } from "../mocks/user";
import { cleanTestDB } from "@utils/mongo";
import supertest from "supertest";
import { generateMockRecipient } from "../mocks/recipient";
import { RecipientDocument } from "@models/RecipientModel";
// @ts-ignore
import faker from "faker/locale/it";

const API = process.env.API_PATH;

@suite("RubricRoute") class RubricRouteTests {

    http = supertest(ioc.resolve(ExpressServer).app);
    token = ""; // system token

    rubricService = ioc.resolve(RubricService);
    recipientService = ioc.resolve(RecipientService);
    userService = ioc.resolve(UserService);
    authService = ioc.resolve(AuthService);

    static async before() { await generateSystemUser(); }
    async before() { this.token = await loginWithSystem(); }

    @test async "Should create a new rubric associated with system user" () {
        const mockRubric = generateMockRubric((await getSystemUser())._id);

        const { body } = await this.http
            .post(`${API}/rubric`)
            .set("Authorization", this.token)
            .send(mockRubric)
            .expect(201);

        const rubric = await this.rubricService.findById(body._id);
        assertSameRubric(mockRubric, rubric);
    }

    @test async "Should not be able to create a rubric for someone else" () {
        const system = await getSystemUser();
        const otherUser = await saveMockUserAndLogin();
        const mockRubric = generateMockRubric(system._id);

        const { body } = await this.http
            .post(`${API}/rubric`)
            .set("Authorization", otherUser.token)
            .send(mockRubric)
            .expect(201);

        // At this point body.user should not be otherUser._id, rather system._id
        expect(body.user).to.equal(otherUser.user._id.toString());
        expect(body.user).not.to.equal(system._id.toString());
    }

    @test async "Should not be able to create a rubric without a token" () {
        await this.http
            .post(`${API}/rubric`)
            .send(generateMockRubric("bullshit"))
            .expect(401);
    }

    @test async "Should not be able to create a rubric with invalid body" () {
        const mockRubric = await generateMockRubric((await getSystemUser())._id);
        delete mockRubric.name; // Required param

        await this.http
            .post(`${API}/rubric`)
            .set("Authorization", this.token)
            .send(mockRubric)
            .expect(400);

        mockRubric.name = faker.fake("{{internet.userName}}'s Test Contacts");
        mockRubric.notes = faker.lorem.sentence(500); // Surpasses char limit

        await this.http
            .post(`${API}/rubric`)
            .set("Authorization", this.token)
            .send(mockRubric)
            .expect(400);
    }

    @test async "Should query rubrics correctly" () {
        const giovanni = await this.userService.save({ ...userGiovanni, active: true });
        const otherUser = await this.userService.save(generateMockUser());
        const tokenGiovanni = await this.authService.login({ usernameOrEmail: giovanni.username, password: userGiovanni.password });

        const recipients: string[] = [
            (await this.recipientService.save(generateMockRecipient(giovanni._id)))._id.toString(),
            (await this.recipientService.save(generateMockRecipient(giovanni._id)))._id.toString(),
            (await this.recipientService.save(generateMockRecipient(giovanni._id)))._id.toString(),
        ];

        const mockRubrics = [
            await generateMockRubric(giovanni._id, recipients),
            await generateMockRubric(giovanni._id),
            await generateMockRubric(otherUser._id),
        ];
        for (const mr of mockRubrics) await this.rubricService.save(mr);

        let res = await this.http
            .post(`${API}/rubric/query`)
            .set("Authorization", tokenGiovanni)
            .send({
                // Will use default pagination
                pagination: {
                    populate: "recipients"
                },
                query: {
                    name: mockRubrics[0].name
                }
            })
            .expect(200);

        expect(res.body.meta.total).to.equal(1);
        expect(res.body.meta.pages).to.equal(1);
        expect(res.body.docs.length).to.equal(1);
        expect(res.body.docs[0].name).to.equal(mockRubrics[0].name);

        // Rubric will have populated recipients
        res.body.docs[0].recipients.forEach((rec: RecipientDocument) => expect(recipients).to.contain(rec._id));

        res = await this.http
            .post(`${API}/rubric/query`)
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

    @test async "Should get rubric by id correctly" () {
        const mockUser = await saveMockUserAndLogin();
        const rubric = await this.rubricService.save(generateMockRubric(mockUser.user._id));

        const { body } = await this.http
            .get(`${API}/rubric/${rubric._id}`)
            .set("Authorization", mockUser.token)
            .send()
            .expect(200);

        assertSameRubric(rubric, body);

        const mockOtherUser = await saveMockUserAndLogin();

        await this.http
            .get(`${API}/rubric/${rubric._id}`)
            .set("Authorization", mockOtherUser.token)
            .send()
            .expect(404);
    }

    @test async "Should update rubric by id correctly" () {
        const mockUser = await saveMockUserAndLogin();
        const mockRubric = generateMockRubric(mockUser.user._id);
        const rubric = await this.rubricService.save(mockRubric);

        await this.http
            .post(`${API}/rubric`)
            .set("Authorization", this.token)
            .send(mockRubric)
            .expect(201);

        const newName = "Test Name";

        const { body } = await this.http
            .put(`${API}/rubric/${rubric._id}`)
            .set("Authorization", mockUser.token)
            .send({
                name: newName
            })
            .expect(200);

        rubric.name = newName; // Align with update
        assertSameRubric(rubric, body);

        const mockOtherUser = await saveMockUserAndLogin();

        await this.http
            .put(`${API}/rubric/${rubric._id}`)
            .set("Authorization", mockOtherUser.token)
            .send({
                cf: "modified"
            })
            .expect(404);
    }

    static after() { cleanTestDB(); }

}
