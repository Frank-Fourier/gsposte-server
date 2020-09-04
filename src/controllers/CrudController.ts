import { Request, Response } from "express";
import { inject, injectable, unmanaged } from "inversify";
import { MongoRepository } from "@services/MongoRepository";
import { AuthService } from "@services/AuthService";
import { Document } from "mongoose";
import { UserRoles } from "@models/UserModel";
import httpErrors from "http-errors";

@injectable()
export class CrudController {

    @inject(AuthService) protected authService: AuthService;

    constructor(
        @unmanaged() private service: MongoRepository<object, Document>,
        @unmanaged() protected userBased: boolean = false,
        @unmanaged() protected readOnly: boolean = false, // If true, only admins can create/update/delete
        @unmanaged() protected accessRole: UserRoles = UserRoles.ROLE_USER,
    ) {}

    public async create(req: Request, res: Response) {
        await this.authService.roleOnly(req, this.accessRole);
        if (this.readOnly) {
            await this.authService.adminOnly(req);
        }

        this.service.validateObject(req.body);
        const object = req.body;

        if (this.userBased) {
            const user = await this.authService.getUserFromRequest(req);
            if (!object.user || (object.user && !user.isAdmin())) {
                // Force the associated user to be the request user
                object.user = user.id;
            }
        }

        const saved = await this.service.save(object);
        return res.status(201).send(saved);
    }

    public async find(req: Request, res: Response) {
        await this.authService.roleOnly(req, this.accessRole);
        const pagination = this.service.paginateOptionsFromObject(req.body.pagination);

        if (this.userBased) {
            const user = await this.authService.getUserFromRequest(req);
            if (!user.isAdmin()) {
                // Modify the query so it will always retrieve only documents associated with the requesting user
                delete req.body.query.user; // If already present...
                req.body.query = {
                    ...req.body.query,
                    user: user.id
                }
            }
        }

        const result = await this.service.paginate(req.body.query, pagination);
        return res.status(200).send(result);
    }

    public async findById(req: Request, res: Response) {
        await this.authService.roleOnly(req, this.accessRole);
        const obj = await this.service.findById(req.params.id);

        if (this.userBased) {
            const user = await this.authService.getUserFromRequest(req);
            if ((obj as any).user.toString() !== user._id.toString() && !user.isAdmin()) {
                throw new httpErrors.Forbidden("You are not authorized to view recipients that aren't yours!");
            }
        }

        return res.status(200).send(obj);
    }

    public async updateById(req: Request, res: Response) {
        await this.authService.roleOnly(req, this.accessRole);
        if (this.readOnly) {
            await this.authService.adminOnly(req);
        }

        if (this.userBased) {
            const user = await this.authService.getUserFromRequest(req);
            const obj = await this.service.findById(req.params.id);
            if ((obj as any).user.toString() !== user._id.toString() && !user.isAdmin()) {
                throw new httpErrors.Forbidden("You are not authorized to update recipients that aren't yours!");
            }
        }

        const updated = await this.service.updateById(req.params.id, req.body);
        return res.status(200).send(updated);
    }

    public async deleteById(req: Request, res: Response) {
        await this.authService.roleOnly(req, this.accessRole);
        if (this.readOnly) {
            await this.authService.adminOnly(req);
        }

        if (this.userBased) {
            const user = await this.authService.getUserFromRequest(req);
            const obj = await this.service.findById(req.params.id);
            if ((obj as any).user.toString() !== user._id.toString() && !user.isAdmin()) {
                throw new httpErrors.Forbidden("You are not authorized to delete recipients that aren't yours!");
            }
        }

        const deleted = await this.service.deleteById(req.params.id);
        return res.status(200).send(deleted);
    }

}
