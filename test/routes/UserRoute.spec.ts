import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { ExpressServer } from "@server";
import { generateSystemUser } from "@utils/system";
import { getSystemUser, loginWithSystem } from "../test_utils";
import { userGiovanni } from "../mocks/user";
import { UserService } from "@services/UserService";
import { cleanTestDB } from "@utils/mongo";
import supertest from "supertest";
import { UserRoles } from "@models/UserModel";
import { AuthService } from "@services/AuthService";
import { comparePasswords } from "@utils/crypto";

const API = process.env.API_PATH;

@suite class UserRouteTests {

    http = supertest(ioc.resolve(ExpressServer).app);
    token = ""; // system token

    userService = ioc.resolve(UserService);
    authService = ioc.resolve(AuthService);

    static async before() { await generateSystemUser(); }
    async before() { this.token = await loginWithSystem(); }

    @test async "Should register a new user with admin privileges" () {
        const { body } = await this.http
            .post(`${API}/user/register`)
            .set("Authorization", this.token)
            .send(userGiovanni)
            .expect(201);

        const user = await this.userService.findById(body._id);
        expect(user.username).to.equal(userGiovanni.username);
        expect(user.email).to.equal(userGiovanni.email);
        expect(user.roles.length).to.equal(1);
        expect(user.roles[0]).to.equal(UserRoles.ROLE_USER);
    }

    @test async "Should not register a duplicate user" () {
        await this.http
            .post(`${API}/user/register`)
            .set("Authorization", this.token)
            .send({
                username: "system_duplicate",
                email: "system@server",
                password: "MakotoBestGirl2020"
            })
            .expect(409);
    }

    @test async "Should not register an user without admin privileges" () {
        await this.http
            .post(`${API}/user/register`)
            .send({
                username: "im_vig",
                email: "mafioso@claim",
                password: "ImmaLeaveD1"
            })
            .expect(401);

        const userToken = await this.authService.login({
            usernameOrEmail: userGiovanni.username,
            password: userGiovanni.password
        });

        await this.http
            .post(`${API}/user/register`)
            .set("Authorization", userToken)
            .send({
                username: "bad_user",
                email: "flex@boy",
                password: "GallagherFlexBambinoSelvaggio"
            })
            .expect(403);
    }

    @test async "Should not register with invalid user inputs" () {
        await this.http
            .post(`${API}/user/register`)
            .set("Authorization", this.token)
            .send({
                username: "im_bg",
                password: "ImmaSellOutMyMafia",
                roles: [ UserRoles.ROLE_USER ]
            })
            .expect(400);

        await this.http
            .post(`${API}/user/register`)
            .set("Authorization", this.token)
            .send({
                roles: [ UserRoles.ROLE_USER ]
            })
            .expect(400);

        await this.http
            .post(`${API}/user/register`)
            .set("Authorization", this.token)
            .send({
                password: "ImmaSellOutMyMafia",
            })
            .expect(400);

        await this.http
            .post(`${API}/user/register`)
            .set("Authorization", this.token)
            .send({
                username: "im_bg",
            })
            .expect(400);

        await this.http
            .post(`${API}/user/register`)
            .set("Authorization", this.token)
            .send({
                username: "im_bg",
                email: "godfather@claim",
            })
            .expect(400);
    }

    @test async "Should update password by token" () {
        const old_pass = (await getSystemUser()).password;

        await this.http
            .put(`${API}/user/update/password`)
            .set("Authorization", this.token)
            .send({
                currentPassword: process.env.SYSTEM_PASS,
                newPassword: "updated"
            })
            .expect(200);

        const new_pass = (await getSystemUser()).password;
        expect(new_pass).not.to.equal(old_pass, "Password was not updated!");
        expect(new_pass).not.to.equal("updated", "!!! PASSWORD WAS NOT HASHED !!!");
        expect(await comparePasswords(new_pass, "updated")).to.be.true;

        await this.http
            .put(`${API}/user/update/password`)
            .set("Authorization", this.token)
            .send({
                currentPassword: "updated",
                newPassword: process.env.SYSTEM_PASS
            })
            .expect(200);
    }

    @test async "Should not update password with invalid requests" () {
        const system_pass = (await getSystemUser()).password;

        await this.http
            .put(`${API}/user/update/password`)
            .send({
                currentPassword: process.env.SYSTEM_PASS,
                newPassword: "updated_new"
            })
            .expect(401);

        await this.http
            .put(`${API}/user/update/password`)
            .send({
                currentPassword: "wrong",
                newPassword: "updated_new"
            })
            .expect(401);

        await this.http
            .put(`${API}/user/update/password`)
            .set("Authorization", this.token)
            .send({
                currentPassword: "wrong",
                newPassword: "updated_new"
            })
            .expect(401);

        await this.http
            .put(`${API}/user/update/password`)
            .set("Authorization", this.token)
            .send({
                currentPassword: "wrong",
                malformed: "updated_new"
            })
            .expect(400);

        await this.http
            .put(`${API}/user/update/password`)
            .set("Authorization", this.token)
            .expect(400);

        await this.http
            .put(`${API}/user/update/password`)
            .set("Authorization", this.token)
            .send({
                newPassword: "updated_new"
            })
            .expect(400);

        const new_pass = (await getSystemUser()).password;
        expect(new_pass).to.equal(system_pass, "Password was updated when it shouldn't have!");
    }

    static after() { cleanTestDB(); }

}
