import { MongoRepository } from "@services/MongoRepository";
import { Price, priceDecoder, PriceDocument, PriceModel } from "@models/PriceModel";
import { provide } from "inversify-binding-decorators";
import { LetterDocument } from "@models/LetterModel";
import { LetterKind } from "@services/PostelService";

@provide(PriceService)
export class PriceService extends MongoRepository<Price, PriceDocument> {

    constructor(private priceModel = PriceModel) {
        super(priceModel, priceDecoder);
    }

    public async getPriceForWeight(weight: number, kind: LetterKind): Promise<PriceDocument> {
        return await this.findOne({
            minWeight: { $lte: weight },
            maxWeight: { $gte: weight },
            // Because RACCOMANDATA and RACCOMANDATA_AR are the same thing in this context
            kind: kind === LetterKind.LETTERA_SEMPLICE ? kind : LetterKind.RACCOMANDATA
        } as object);
    }

    public async calculatePrice(letter: LetterDocument): Promise<number> {
        const envelopeWeight = parseFloat(process.env.ENVELOPE_WEIGHT || "10");
        const paperWeight = parseFloat(process.env.PAPER_WEIGHT || "1");
        const totalWeight = envelopeWeight + (paperWeight * letter.recipients.length);

        return (await this.getPriceForWeight(totalWeight, letter.kind)).price;
    }

}
