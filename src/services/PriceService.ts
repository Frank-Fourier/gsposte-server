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

    /**
     * Finds the right price in the ranges for the provided weight and letter kind
     *
     * @param weight {number} Weight of the letter in grams
     * @param kind {LetterKind} Letter kind
     * @returns {Promise<PriceDocument>} Found price range from database
     */
    public async getPriceForWeight(weight: number, kind: LetterKind): Promise<PriceDocument> {
        return this.findOne({
            minWeight: { $lte: weight },
            maxWeight: { $gte: weight },
            kind: kind
        } as object);
    }

    /**
     * Given a letter, calculates its weight and returns it
     *
     * @param letter {LetterDocument} Letter to get weight for
     * @returns { pages: number, weight: number } The number of pages of the PDF and the weight
     */
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

    /**
     * Calculates and returns the price of a single letter
     *
     * @param letter {LetterDocument} Letter to calculate the price for
     * @returns {Promise<number>} Calculated price
     */
    public async calculatePrice(letter: LetterDocument): Promise<number> {
        const { pages, weight } = await this.calculateWeight(letter);
        const { price, extra } = await this.getPriceForWeight(weight, letter.kind);

        logger.info(`Calculated price for letter ${letter.codePdf} with ${pages} pages is: ${price}€ with ${extra}€ as extra`);
        return letter.bw ? price : (price + extra);
    }

}
