import { UserDocument, UserRoles } from "@models/UserModel";
import { ioc } from "@ioc";
import { UserService } from "@services/UserService";
import { logger } from "@utils/winston";

export async function generateSystemUser(): Promise<UserDocument> {
    !isTestEnv() && logger.info("Creating system user!");
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
        logger.error("Failed to create system user!", err);
        return;
    }
}

export function isTestEnv(): boolean {
    return process.env.NODE_ENV === "test";
}
export function isProdEnv(): boolean {
    return process.env.NODE_ENV === "production";
}
