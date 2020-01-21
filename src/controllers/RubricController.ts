import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { RubricService } from "@services/RubricService";
import { AuthService } from "@services/AuthService";
import { Rubric } from "@models/RubricModel";
import httpErrors from "http-errors";

@provide(RubricController)
export class RubricController {

    @inject(RubricService) private rubricService: RubricService;
    @inject(AuthService) private authService: AuthService;

    public async create(req: Request, res: Response) {
        this.rubricService.validateObject(req.body);
        const user = await this.authService.getUserFromRequest(req);

        const rubric = req.body as Rubric;
        if (rubric.user && !user.isAdmin()) {
            // Force the associated user to be the request user
            rubric.user = user._id;
        }

        const newRubric = await this.rubricService.save(rubric);

        return res.status(201).send(newRubric);
    }

    public async find(req: Request, res: Response) {
        const pagination = this.rubricService.paginateOptionsFromObject(req.body.pagination);

        const user = await this.authService.getUserFromRequest(req);
        if (!user.isAdmin()) {
            // Modify the query so it will always retrieve only documents associated with the requesting user
            delete req.body.query.user; // If already present...
            req.body.query = {
                ...req.body.query,
                user: user._id
            }
        }
        const rubrics = await this.rubricService.paginate(req.body.query, pagination, true);

        return res.status(200).send(rubrics);
    }

    public async findById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const rubric = await this.rubricService.findById(req.params.id);
        if (rubric.user.toString() !== user._id.toString() && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to view rubrics that aren't yours!");
        }

        return res.status(200).send(rubric);
    }

    public async updateById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const rubric = await this.rubricService.findById(req.params.id);
        if (rubric.user.toString() !== user._id.toString() && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to update rubrics that aren't yours!");
        }
        const updated = await this.rubricService.updateById(req.params.id, req.body);

        return res.status(200).send(updated);
    }

    public async deleteById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const rubric = await this.rubricService.findById(req.params.id);
        if (rubric.user !== user._id && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to delete rubrics that aren't yours!");
        }
        const deleted = await this.rubricService.deleteById(req.params.id);

        return res.status(200).send(deleted);
    }

}
