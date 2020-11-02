import ora from "ora";
import { UserDocument, UserRoles } from "@models/UserModel";
import { ioc } from "@ioc";
import { UserService } from "@services/UserService";

export async function generateSystemUser(): Promise<UserDocument> {
    const spinner = process.env.NODE_ENV != "test" ? ora("Creating system user!").start() : null;
    try {
        return await ioc.resolve(UserService).save({
            username: "system",
            email: "system@server",
            password: process.env.SYSTEM_PASS,
            iva: "42424242424",
            phone: "3281426266",
            active: true,
            roles: [ UserRoles.ROLE_USER, UserRoles.ROLE_ADMIN ]
        });
    } catch (err) {
        spinner && spinner.fail(`Failed to create system user! ${err}`);
        return;
    } finally { spinner && spinner.succeed("Created system user!"); }
}

export function isTestEnv(): boolean {
    return process.env.NODE_ENV === "test";
}
