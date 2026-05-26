import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { UserService } from "@services/UserService";
import { User, UserPasswordUpdate, userPasswordUpdateDecoder } from "@models/UserModel";
import { logger } from "@utils/winston";
import httpErrors from "http-errors";
import { CrudController } from "@controllers/CrudController";
import { isTestEnv } from "@utils/system";
import { MailService } from "@services/MailService";

@provide(UserController)
export class UserController extends CrudController {

    constructor(
        @inject(UserService) private userService: UserService,
        @inject(MailService) private mailService: MailService,
    ) {
        super(userService, false, true);
    }

    public async find(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        return super.find(req, res);
    }

    public async findById(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        return super.findById(req, res);
    }

    public async register(req: Request, res: Response) {
        this.userService.validateObject(req.body);
        delete req.body.roles;
        delete req.body.active;

        const user = await this.userService.save(req.body as User);
        if (!isTestEnv()) {
            this.mailService.sendRegistrationMail(user);
        }

        return res.status(201).send(user);
    }

    public async updateMe(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);
        if (req.body.password) {
            throw new httpErrors.BadRequest("Usare la chiamata PUT /update/password per modificare la password.");
        }
        if ((req.body.roles || req.body.active) && !user.isAdmin()) {
            throw new httpErrors.Forbidden("Solo gli amministratori possono modificare i campi proibiti (roles, active).");
        }

        const updated = await this.userService.updateById(user.id, req.body);
        return res.status(200).send(updated);
    }

    public async updatePassword(req: Request, res: Response) {
        try { userPasswordUpdateDecoder.runWithException(req.body) } catch (err) { return res.status(400).send(err) }
        const user = await this.authService.getUserFromRequest(req);

        logger.info(`User ${user.username} is trying to update its password!`);
        await this.userService.updatePassword(user, req.body as UserPasswordUpdate);

        return res.status(200).send({ message: "Password modificata correttamente." });
    }

    public async activate(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        if (!req.params.id) {
            throw new httpErrors.BadRequest("ID dell'utente mancante.")
        }

        const user = await this.userService.activate(req.params.id);
        return res.status(200).send(user);
    }

}
