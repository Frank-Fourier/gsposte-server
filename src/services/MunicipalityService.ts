import { MongoRepository } from "@services/MongoRepository";
import { Municipality, MunicipalityDocument, MunicipalityModel, municipalityDecoder } from "@models/MunicipalityModel";
import { provide } from "inversify-binding-decorators";

@provide(MunicipalityService)
export class MunicipalityService extends MongoRepository<Municipality, MunicipalityDocument> {

    constructor(private municipalityModel = MunicipalityModel) {
        super(municipalityModel, municipalityDecoder);
    }

}
