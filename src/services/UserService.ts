import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "./MongoRepository";
import { UserModel, User, UserDocument, UserPasswordUpdate, userDecoder } from "@models/UserModel";
import { comparePasswords } from "@utils/crypto";
import httpErrors from "http-errors";

@provide(UserService)
export class UserService extends MongoRepository<User, UserDocument> {

    constructor(private userModel = UserModel) {
        super(userModel, userDecoder, [
            "username", "email", "iva"
        ]);
    }

    public async updatePassword(user: UserDocument, passwordUpdate: UserPasswordUpdate) {
        if (!await comparePasswords(user.password, passwordUpdate.currentPassword)) {
            throw new httpErrors.Unauthorized("Wrong old password!");
        }
        await this.updateById(user._id, { password: passwordUpdate.newPassword });
    }

    public async activate(id: string): Promise<UserDocument> {
        return await this.updateById(id, {
            $set: { active: true }
        });
    }

    public async getUserReferrer(user: UserDocument): Promise<UserDocument> {
        return this.findOne({ referCode: user.referFrom }).catch(() => null);
    }

    public async getUserReferrers(user: UserDocument, maxLevel: number): Promise<UserDocument[]> {
        const referrers = [ user ];
        const recursiveGetUserReferrer = async (user: UserDocument, level: number): Promise<UserDocument[]> => {
            if (level === maxLevel + 1) return;
            const parent = await this.getUserReferrer(user);
            if (!!parent) {
                referrers.push(parent);
                return await recursiveGetUserReferrer(parent, level + 1);
            }
        };

        await recursiveGetUserReferrer(user, 0);
        return referrers;
    }

}
