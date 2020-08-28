import { MongoQuery, MongoRepository } from "@services/MongoRepository";
import { Provision, provisionDecoder, ProvisionDocument, ProvisionModel } from "@models/ProvisionModel";
import { provide } from "inversify-binding-decorators";
import { LetterDocument } from "@models/LetterModel";
import { inject } from "inversify";
import { PriceService } from "@services/PriceService";
import { UserService } from "@services/UserService";
import { UserDocument } from "@models/UserModel";
import provisionJson from "../../provisions.json";
import { RevenueService } from "@services/RevenueService";

export interface ProvisionRanges {
    percents: number[]
    ranges: {
        [key: string]: {
            "0-20": number
            "21-50": number
            "51-100": number
        }
    }
}
export type Ranges = "0-20" | "21-50" | "51-100";

/**
 * @swagger
 *
 * definitions:
 *   RevenueMonths:
 *     type: object
 *     properties:
 *       year:
 *         type: number
 *         description: Year of this revenue data
 *         example: 2020
 *       total:
 *         type: number
 *         description: Total amount of revenues in €
 *         example: 240
 *       spent:
 *         type: number
 *         description: Total amount of € spent for this campaign
 *         example: 500
 *       jan:
 *         type: number
 *         example: 20
 *       feb:
 *         type: number
 *         example: 20
 *       mar:
 *         type: number
 *         example: 20
 *       apr:
 *         type: number
 *         example: 20
 *       may:
 *         type: number
 *         example: 20
 *       jun:
 *         type: number
 *         example: 20
 *       jul:
 *         type: number
 *         example: 20
 *       aug:
 *         type: number
 *         example: 20
 *       sep:
 *         type: number
 *         example: 20
 *       oct:
 *         type: number
 *         example: 20
 *       nov:
 *         type: number
 *         example: 20
 *       dec:
 *         type: number
 *         example: 20
 */
export interface RevenueMonths {
    year: number
    total: number
    [key: string]: number
}

@provide(ProvisionService)
export class ProvisionService extends MongoRepository<Provision, ProvisionDocument> {

    @inject(PriceService) private priceService: PriceService;
    @inject(UserService) private userService: UserService;
    @inject(RevenueService) private revenueService: RevenueService;

    constructor(private provisionModel = ProvisionModel) {
        super(provisionModel, provisionDecoder);
    }

    /**
     * Generates a provision for a letter and persists it in the database
     *
     * @param letter {LetterDocument} Letter to generate provision from
     * @returns {Promise<ProvisionDocument>} Generated provision document
     */
    public async generateProvision(letter: LetterDocument): Promise<ProvisionDocument> {
        const { percents, ranges } = provisionJson as ProvisionRanges;
        const { user } = await letter.populate("user").execPopulate();

        // Calculate the amount of total provision
        const { weight } = await this.priceService.calculateWeight(letter);
        const amountKey = Object.keys(ranges[letter.kind]).filter((range: Ranges) => {
            const [ lower, upper ] = range.split("-");
            return parseFloat(lower) <= weight && parseFloat(upper) >= weight;
        })[0] as Ranges;

        const revenue = ranges[letter.kind][amountKey] * letter.recipients.length;
        const spent = letter.price * letter.recipients.length;

        const referrers = await this.userService.getUserReferrers(user as UserDocument, percents.length - 1);
        return this.save({
            letter: letter.id,
            revenue: parseFloat(revenue.toPrecision(3)),
            spent: parseFloat(spent.toPrecision(3)),
            weight: weight,
            referrers: referrers.map((referrer, index) => ({
                // For each referrer calculate percentage of the total provision (if present)
                user: referrer,
                amount: revenue * percents[index] / 100,
                percent: percents[index]
            }))
        });
    }

    /**
     * Calculates and returns the revenue for a single user (money made from provisions)
     *
     * @param userId {string} User ID
     * @param query {MongoQuery<Provision> | any} Optional additional query done on Provision table
     * @returns {Promise<number>} Revenue in €
     */
    public async calculateRevenue(userId: string, query?: MongoQuery<Provision> | any): Promise<number> {
        const provisions = await this.find({
            ...query,
            referrers: { $elemMatch: { user: userId } }
        });
        return provisions.reduce<number>((acc, cur) => acc + cur.referrers.find(ref => ref.user.toString() === userId).amount, 0);
    }

    /**
     * Calculates the current month's revenue for a single user and retrieves from the database all the previous revenue entries
     * and forms a final object containing all revenues for each month for a specific user
     *
     * @param userId {string} User ID
     * @returns {Promise<RevenueMonths>} The object containing all months
     */
    public async calculateRevenuesMonthly(userId: string): Promise<RevenueMonths> {
        const months: { [key: string]: number } = {
            "jan": 0, "feb": 0, "mar": 0, "apr": 0, "may": 0, "jun": 0, "jul": 0, "aug": 0, "sep": 0, "oct": 0, "nov": 0, "dec": 0
        };
        const currentYear = new Date().getFullYear(), currentMonth = new Date().getMonth();

        const pastRevenues = await this.revenueService.find({
            user: userId,
            year: currentYear,
            month: { $lt: currentMonth }
        });
        const currentRevenue = await this.calculateRevenue(userId, { month: currentMonth });

        const revenueMonths = { ...months };
        pastRevenues.forEach(pastRevenue => revenueMonths[Object.keys(months)[pastRevenue.month]] = pastRevenue.amount);
        revenueMonths[Object.keys(months)[currentMonth]] = currentRevenue;

        return {
            year: currentYear,
            total: Object.values(revenueMonths).reduce<number>((acc, cur) => acc + cur, 0),
            ...revenueMonths
        };
    }

}
