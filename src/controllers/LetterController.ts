import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { CrudController } from "@controllers/CrudController";
import { LetterService } from "@services/LetterService";

@provide(LetterService)
export class LetterController extends CrudController {

    constructor(@inject(LetterService) private letterService: LetterService) {
        super(letterService, true);
    }

}
