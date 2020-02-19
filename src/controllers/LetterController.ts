import { Request, Response } from "express";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { LetterService } from "@services/LetterService";
import { AuthService } from "@services/AuthService";
import { Letter } from "@models/LetterModel";
import httpErrors from "http-errors";

@provide(LetterController)
export class LetterController {

    @inject(LetterService) private letterService: LetterService;
    @inject(AuthService) private authService: AuthService;

    public async create(req: Request, res: Response) {
        this.letterService.validateObject(req.body);
        const user = await this.authService.getUserFromRequest(req);

        const letter = req.body as Letter;
        if (!letter.user || (letter.user && !user.isAdmin())) {
            // Force the associated user to be the request user
            letter.user = user._id;
        }

        const newLetter = await this.letterService.save(letter);
        return res.status(201).send(newLetter);
    }

    public async find(req: Request, res: Response) {
        const pagination = this.letterService.paginateOptionsFromObject(req.body.pagination);

        const user = await this.authService.getUserFromRequest(req);
        if (!user.isAdmin()) {
            // Modify the query so it will always retrieve only documents associated with the requesting user
            delete req.body.query.user; // If already present...
            req.body.query = {
                ...req.body.query,
                user: user._id
            }
        }

        const letters = await this.letterService.paginate(req.body.query, pagination, true);
        return res.status(200).send(letters);
    }

    public async findById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const letter = await this.letterService.findById(req.params.id);
        if (letter.user.toString() !== user._id.toString() && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to view letters that aren't yours!");
        }

        return res.status(200).send(letter);
    }

    public async updateById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const letter = await this.letterService.findById(req.params.id);
        if (letter.user.toString() !== user._id.toString() && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to update letters that aren't yours!");
        }

        const updated = await this.letterService.updateById(req.params.id, req.body);
        return res.status(200).send(updated);
    }

    public async deleteById(req: Request, res: Response) {
        const user = await this.authService.getUserFromRequest(req);

        const letter = await this.letterService.findById(req.params.id);
        if (letter.user !== user._id && !user.isAdmin()) {
            throw new httpErrors.Forbidden("You are not authorized to delete letters that aren't yours!");
        }

        const deleted = await this.letterService.deleteById(req.params.id);
        return res.status(200).send(deleted);
    }

}
