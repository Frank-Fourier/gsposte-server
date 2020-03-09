import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { CrudController } from "@controllers/CrudController";
import { LetterService } from "@services/LetterService";
import { Request, Response } from "express";
import httpErrors from "http-errors";

@provide(LetterService)
export class LetterController extends CrudController {

    constructor(@inject(LetterService) private letterService: LetterService) {
        super(letterService, true);
    }

    public async updateById(req: Request, res: Response) {
        const letter = await this.letterService.findById(req.params.id);
        if (letter.sent) {
            throw new httpErrors.Forbidden("This letter is marked as sent, so it can't be updated anymore.");
        }

        // Checks for bad update body (pardon the bad code)
        if (
            ("sent" in req.body || "stats" in req.body || "uuid" in req.body) ||
            ("$set" in req.body &&
                ("sent" in req.body["$set"] || "stats" in req.body["$set"] || "uuid" in req.body["$set"]) ||
                ("stats.status" in req.body["$set"] || "stats.envelopes" in req.body["$set"])
            )
        ) {
            throw new httpErrors.Forbidden("You can't modify these parameters!");
        }

        // Can proceed with the update call
        return super.updateById(req, res);
    }

}
