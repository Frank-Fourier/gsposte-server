import { CrudController } from "@controllers/CrudController";
import { inject } from "inversify";
import { MunicipalityService } from "@services/MunicipalityService";

export class MunicipalityController extends CrudController {

    constructor(@inject(MunicipalityService) private municipalityService: MunicipalityService) {
        super(municipalityService, false, true);
    }

}
