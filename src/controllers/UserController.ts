import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { UserService } from "@services/UserService";
import { AuthService } from "@services/AuthService";
import { User, UserPasswordUpdate, userPasswordUpdateDecoder } from "@models/UserModel";
import { logger } from "@utils/winston";
import httpErrors from "http-errors";

@provide(UserController)
export class UserController {

    @inject(UserService) private userService: UserService;
    @inject(AuthService) private authService: AuthService;

    public async register(req: Request, res: Response) {
        this.userService.validateObject(req.body);

        const user = req.body as User;
        logger.info(`Trying to register a new user named ${user.username}...`);
        const newUser = await this.userService.save(user);

        return res.status(201).send(newUser);
    }

    public async updatePassword(req: Request, res: Response) {
        try { userPasswordUpdateDecoder.runWithException(req.body) } catch (err) { return res.status(400).send(err) }
        const user = await this.authService.getUserFromRequest(req);

        logger.info(`User ${user.username} is trying to update its password!`);
        await this.userService.updatePassword(user, req.body as UserPasswordUpdate);

        return res.status(200).send({ message: "Password updated successfully" });
    }

    public async activate(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        if (!req.params.id) {
            throw new httpErrors.BadRequest("No user id to activate was provided. Please provide one as a path param.")
        }

        const user = await this.userService.activate(req.params.id);
        return res.status(200).send(user);
    }

}
