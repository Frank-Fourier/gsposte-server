import { MongoRepository } from "@services/MongoRepository";
import { Price, priceDecoder, PriceDocument, PriceModel } from "@models/PriceModel";
import { provide } from "inversify-binding-decorators";
import { LetterDocument } from "@models/LetterModel";
import { LetterKind } from "@services/PostelService";
import { inject } from "inversify";
import { PdfService } from "@services/PdfService";
import { logger } from "@utils/winston";

@provide(PriceService)
export class PriceService extends MongoRepository<Price, PriceDocument> {

    @inject(PdfService) private pdf: PdfService;

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
        const envelopeWeight = parseFloat(process.env.ENVELOPE_WEIGHT || "5");
        const paperWeight = parseFloat(process.env.PAPER_WEIGHT || "5");
        let pages = 1;
        try {
            pages = (await this.pdf.metadata(`public/${letter.codePdf}/original.pdf`)).pages;
        } catch (err) {
            // Ignore errors
        }

        if (letter.backSide) {
            pages = Math.ceil(pages / 2);
        }

        logger.info(`Calculating price for letter ${letter.codePdf} with ${pages} pages!`);
        const totalWeight = envelopeWeight + (paperWeight * pages);
        const { price, extra } = (await this.getPriceForWeight(totalWeight, letter.kind));
        return letter.bw ? price : (price + extra);
    }

}
