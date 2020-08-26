import { MongoRepository } from "@services/MongoRepository";
import { Revenue, revenueDecoder, RevenueDocument, RevenueModel } from "@models/RevenueModel";
import { provide } from "inversify-binding-decorators";

@provide(RevenueService)
export class RevenueService extends MongoRepository<Revenue, RevenueDocument> {

    constructor(private revenueModel = RevenueModel) {
        super(revenueModel, revenueDecoder);
    }

}
