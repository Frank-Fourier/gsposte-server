import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { UserService } from "@services/UserService";
import { AuthService } from "@services/AuthService";
import { User, UserDocument, UserPasswordUpdate, userPasswordUpdateDecoder } from "@models/UserModel";
import { logger } from "@utils/winston";

@provide(UserController)
export class UserController {

    @inject(UserService) private userService: UserService;
    @inject(AuthService) private authService: AuthService;

    public async register(req: Request, res: Response) {
        await this.authService.adminOnly(req.headers.authorization);
        this.userService.validateObject(req.body);

        const user = req.body as User;
        logger.info(`Trying to register a new user named ${user.username}...`);
        const newUser = await this.userService.save(user);

        return res.status(201).send(newUser);
    }

    public async updatePassword(req: Request, res: Response) {
        try { userPasswordUpdateDecoder.runWithException(req.body) } catch (err) { return res.status(400).send(err) }
        const user: UserDocument = await this.authService.getUserByToken(req.headers.authorization);

        logger.info(`User ${user.username} is updating its password!`);
        await this.userService.updatePassword(user, req.body as UserPasswordUpdate);

        return res.status(200).send({message: "Password updated successfully"});
    }

}
