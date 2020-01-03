import { provide } from "inversify-binding-decorators";
import { MongoService } from "./MongoService";
import { UserModel, User, UserDocument, UserPasswordUpdate } from "../models/UserModel";
import { comparePasswords } from "../utils/crypto";
import httpErrors from "http-errors";

@provide(UserService)
export class UserService extends MongoService<User, UserDocument> {

    constructor(public userModel = UserModel) {
        super(userModel);
    }

    public async updatePassword(user: UserDocument, passwordUpdate: UserPasswordUpdate) {
        if (!await comparePasswords(user.password, passwordUpdate.currentPassword)) {
            throw new httpErrors.Forbidden("Wrong password!");
        }
        await this.updateById(user._id, { password: passwordUpdate.newPassword });
    }

}
