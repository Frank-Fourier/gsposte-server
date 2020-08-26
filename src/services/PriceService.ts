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
            kind: kind
        } as object);
    }

    public async calculateWeight(letter: LetterDocument): Promise<{ pages: number, weight: number }> {
        const envelopeWeight = parseFloat(process.env.ENVELOPE_WEIGHT || "5");
        const paperWeight = parseFloat(process.env.PAPER_WEIGHT || "5");
        let pages = 1;
        try {
            pages = (await this.pdf.metadata(`public/pdf/${letter.codePdf}/original.pdf`)).pages;
        } catch (err) {
            // Ignore errors
            logger.error(`Error while getting PDF pages for letter ${letter.codePdf}!`, err);
        }

        if (letter.backSide) {
            pages = Math.ceil(pages / 2);
        }

        const weight = envelopeWeight + (paperWeight * pages);
        return { pages, weight };
    }

    public async calculatePrice(letter: LetterDocument): Promise<number> {
        const { pages, weight } = await this.calculateWeight(letter);
        const { price, extra } = await this.getPriceForWeight(weight, letter.kind);

        logger.info(`Calculated price for letter ${letter.codePdf} with ${pages} pages is: € ${price} with € ${extra} as extra`);
        return letter.bw ? price : (price + extra);
    }

}
