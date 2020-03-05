import { MongoRepository } from "@services/MongoRepository";
import { Price, priceDecoder, PriceDocument, PriceModel } from "@models/PriceModel";
import { provide } from "inversify-binding-decorators";

@provide(PriceService)
export class PriceService extends MongoRepository<Price, PriceDocument> {

    constructor(private priceModel = PriceModel) {
        super(priceModel, priceDecoder);
    }

    public async getPriceForWeight(weight: number): Promise<PriceDocument> {
        return await this.findOne({
            minWeight: { $lte: weight },
            maxWeight: { $gte: weight }
        } as object);
    }

}
