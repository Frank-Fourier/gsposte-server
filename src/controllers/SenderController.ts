import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { CrudController } from "@controllers/CrudController";
import { SenderService } from "@services/SenderService";

@provide(SenderController)
export class SenderController extends CrudController {

    constructor(@inject(SenderService) private senderService: SenderService) {
        super(senderService, true);
    }

}
