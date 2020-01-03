import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { Request, Response } from "express";
import { AuthService, LoginPayload } from "../services/AuthService";
import httpErrors from "http-errors";

@provide(AuthController)
export class AuthController {

    constructor(
        @inject(AuthService) private authService: AuthService
    ) {}

    public async login(req: Request, res: Response) {
        try {
            const payload: LoginPayload = req.body;
            if (!payload.usernameOrEmail || !payload.password) {
                return res.status(401).send(new httpErrors.Unauthorized("Invalid username or password!"))
            }

            const token = await this.authService.login(payload);
            return res.status(200).send(token);
        } catch (err) {
            return res.status(err.statusCode || 500).send(err);
        }
    }

    public async me(req: Request, res: Response) {
        try {
            const user = await this.authService.getUserByToken(req.headers.authorization);
            return res.status(200).send(user);
        } catch (err) {
            return res.status(err.statusCode || 500).send(err);
        }
    }

}
