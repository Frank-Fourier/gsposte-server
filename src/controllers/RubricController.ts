import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { CrudController } from "@controllers/CrudController";
import { RubricService } from "@services/RubricService";

@provide(RubricController)
export class RubricController extends CrudController {

    constructor(@inject(RubricService) private rubricService: RubricService) {
        super(rubricService, true);
    }

}
