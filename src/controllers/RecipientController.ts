import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { RecipientService } from "@services/RecipientService";
import { CrudController } from "@controllers/CrudController";

@provide(RecipientController)
export class RecipientController extends CrudController {

    constructor(@inject(RecipientService) private recipientService: RecipientService) {
        super(recipientService, true);
    }

}
