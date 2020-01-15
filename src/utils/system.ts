import ora from "ora";
import { UserRoles } from "@models/UserModel";
import { ioc } from "@ioc";
import { UserService } from "@services/UserService";

export async function generateSystemUser() {
    const spinner = process.env.NODE_ENV != "test" ? ora("Creating system user!").start() : null;
    try {
        await ioc.resolve(UserService).save({
            username: "system",
            email: "system@server",
            password: process.env.SYSTEM_PASS,
            roles: [ UserRoles.ROLE_USER, UserRoles.ROLE_ADMIN ]
        });
    } catch (err) {
        spinner.fail(`Failed to create system user! ${err}`);
        return;
    }
    spinner && spinner.succeed("Created system user!");
}
