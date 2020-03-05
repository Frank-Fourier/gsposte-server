import { CrudController } from "@controllers/CrudController";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { PriceService } from "@services/PriceService";

@provide(PriceController)
export class PriceController extends CrudController {

    constructor(@inject(PriceService) private priceService: PriceService) {
        super(priceService, false, true);
    }

}
