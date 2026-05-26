import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "./MongoRepository";
import { UserModel, User, UserDocument, UserPasswordUpdate, userDecoder } from "@models/UserModel";
import { comparePasswords } from "@utils/crypto";
import { inject } from "inversify";
import { SenderService } from "@services/SenderService";
import httpErrors from "http-errors";

@provide(UserService)
export class UserService extends MongoRepository<User, UserDocument> {

    @inject(SenderService) private senderService: SenderService;

    constructor(private userModel = UserModel) {
        super(userModel, userDecoder, [
            "username", "email", "iva"
        ]);
    }

    public async save(user: User): Promise<UserDocument> {
        const userDoc = await super.save(user);

        // Create the first sender with empty details
        // Will be filled later by the operator on user activation
        await this.senderService.save({
            user: userDoc.id,
            name: user.username,
            description: user.username,
            email: user.email,
            businessName: user.username,
            invoiceCode: "0000000",
            iva: user.iva,
            address: {
                street: "DA COMPILARE",
                city: "DA COMPILARE",
                zip: "00000",
                province: "00"
            }
        });

        return userDoc;
    }

    public async updatePassword(user: UserDocument, passwordUpdate: UserPasswordUpdate) {
        if (!await comparePasswords(user.password, passwordUpdate.currentPassword)) {
            throw new httpErrors.Unauthorized("La vecchia password non è corretta.");
        }
        await this.updateById(user._id, { password: passwordUpdate.newPassword });
    }

    public async activate(id: string): Promise<UserDocument> {
        return this.updateById(id, {
            $set: { active: true }
        });
    }

}
