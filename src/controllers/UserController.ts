import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { Request, Response } from "express";
import { UserService } from "@services/UserService";
import { AuthService } from "@services/AuthService";
import { User, userDecoder, UserDocument, UserPasswordUpdate, userPasswordUpdateDecoder } from "@models/UserModel";
import { logger } from "@utils/winston";

@provide(UserController)
export class UserController {

    constructor(
        @inject(UserService) private userService: UserService,
        @inject(AuthService) private authService: AuthService,
    ) {}

    public async register(req: Request, res: Response) {
        try {
            await this.authService.adminOnly(req.headers.authorization);
            try { userDecoder.runWithException(req.body) } catch (err) { return res.status(400).send(err) }

            const user: User = req.body;
            logger.info(`Trying to register a new user named ${user.username}...`);
            const newUser = await this.userService.save(user);

            return res.status(201).send(newUser);
        } catch (err) {
            if (err.name === "ValidationError") {
                return res.status(409).send({ error: "Duplicate emails are not allowed" });
            }
            return res.status(err.statusCode || 500).send(err);
        }
    }

    public async updatePassword(req: Request, res: Response) {
        try {
            try { userPasswordUpdateDecoder.runWithException(req.body) } catch (err) { return res.status(400).send(err) }

            const user: UserDocument = await this.authService.getUserByToken(req.headers.authorization);
            logger.info(`User ${user.username} is updating its password!`);

            await this.userService.updatePassword(user, req.body as UserPasswordUpdate);

            return res.status(200).send({message: "Password updated successfully"});
        } catch (err) {
            return res.status(err.statusCode || 500).send(err);
        }
    }

}
