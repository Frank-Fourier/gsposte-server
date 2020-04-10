import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { AuthService, LoginPayload } from "@services/AuthService";
import httpErrors from "http-errors";

@provide(AuthController)
export class AuthController {

    @inject(AuthService) private authService: AuthService;

    async login(req: Request, res: Response) {
        const payload: LoginPayload = req.body;
        if (!payload.usernameOrEmail || !payload.password) {
            throw new httpErrors.Unauthorized("Invalid username or password!");
        }

        const token = await this.authService.login(payload);
        return res.status(200).send(token);
    }

    async tvLogin(req: Request, res: Response) {
        const payload: LoginPayload = req.body;
        if (!payload.usernameOrEmail || !payload.password) {
            throw new httpErrors.Unauthorized("Invalid username or password!");
        }

        const token = await this.authService.tvLogin(payload);
        return res.status(200).send(token);
    }

    async me(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);
        return res.status(200).send(user);
    }

}
