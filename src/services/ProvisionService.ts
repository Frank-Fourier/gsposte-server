import { MongoQuery, MongoRepository, QueryOptions } from "@services/MongoRepository";
import { Provision, provisionDecoder, ProvisionDocument, ProvisionModel } from "@models/ProvisionModel";
import { provide } from "inversify-binding-decorators";
import { LetterDocument } from "@models/LetterModel";
import { inject } from "inversify";
import { PriceService } from "@services/PriceService";
import { UserService } from "@services/UserService";
import { UserDocument } from "@models/UserModel";
import { RevenueService } from "@services/RevenueService";
import { Revenue } from "@models/RevenueModel";
import { Schema } from "mongoose";
import httpErrors from "http-errors";
import moment from "moment";
import provisionConfig from "../../provisions.json";

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
 *   RevenueMonth:
 *     type: object
 *     properties:
 *       amount:
 *         type: number
 *         example: 20
 *       provisions:
 *         type: array
 *         description: Array of provisions used to make this amount
 *         items:
 *           $ref: "#/definitions/ProvisionDocument"
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
 *         $ref: "#/definitions/RevenueMonth"
 *       feb:
 *         $ref: "#/definitions/RevenueMonth"
 *       mar:
 *         $ref: "#/definitions/RevenueMonth"
 *       apr:
 *         $ref: "#/definitions/RevenueMonth"
 *       may:
 *         $ref: "#/definitions/RevenueMonth"
 *       jun:
 *         $ref: "#/definitions/RevenueMonth"
 *       jul:
 *         $ref: "#/definitions/RevenueMonth"
 *       aug:
 *         $ref: "#/definitions/RevenueMonth"
 *       sep:
 *         $ref: "#/definitions/RevenueMonth"
 *       oct:
 *         $ref: "#/definitions/RevenueMonth"
 *       nov:
 *         $ref: "#/definitions/RevenueMonth"
 *       dec:
 *         $ref: "#/definitions/RevenueMonth"
 *   RevenueYears:
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
 *       provisions:
 *         type: array
 *         description: Array of provisions used to make this amount
 *         items:
 *           $ref: "#/definitions/ProvisionDocument"
 */
export interface RevenueMonth {
    amount: number
    provisions: Array<ProvisionDocument>
}
export interface Months {
    jan: RevenueMonth
    feb: RevenueMonth
    mar: RevenueMonth
    apr: RevenueMonth
    may: RevenueMonth
    jun: RevenueMonth
    jul: RevenueMonth
    aug: RevenueMonth
    sep: RevenueMonth
    oct: RevenueMonth
    nov: RevenueMonth
    dec: RevenueMonth
    // Used to avoid nasty Typescript compiler errors
    [key: string]: RevenueMonth | number
}
export interface RevenueMonths extends Months {
    year: number
    total: number
}
export interface RevenueYears {
    year: number
    total: number
    provisions: Array<ProvisionDocument>
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
        if (!!letter.provision) {
            throw new httpErrors.BadRequest("This letter has a provision already. Can't generate it again.");
        }

        const { percents, ranges } = provisionConfig as ProvisionRanges;
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
     * @param options {QueryOptions} Optional query options
     * @param includeMonth {boolean} True if you want to save the current month
     * @returns {Promise<Revenue>} Revenue object
     */
    public async calculateRevenue(userId: string, query?: MongoQuery<Provision> | any, options?: QueryOptions, includeMonth?: boolean): Promise<Revenue> {
        const provisions = await this.find({
            ...query,
            referrers: { $elemMatch: { user: userId } }
        }, options || {});
        return {
            user: userId,
            year: new Date().getFullYear(),
            provisions: provisions,
            amount: provisions
                .reduce<number>((acc, cur) => acc + cur.referrers.find(ref => (
                    (ref.user instanceof Schema.Types.ObjectId ? ref.user.toString() : (ref.user as UserDocument).id.toString()) === userId
                )).amount, 0),
            ...(includeMonth ? { month: new Date().getMonth() } : {})
        };
    }

    /**
     * Calculates the current year's revenue for a single user
     *
     * @param userId {string} User ID
     * @returns {Promise<RevenueMonths>} The object containing all months
     */
    public async calculateRevenueYearly(userId: string): Promise<RevenueYears> {
        const year = new Date().getFullYear();
        const revenue = await this.calculateRevenue(userId, {
            createdAt: {
                $gte: `${year}-01-01`,
                $lte: `${year}-12-31`
            }
        }, {
            populate: [{
                path: "letter",
                select: "sendAt subject kind"
            }, {
                path: "referrers.user",
                select: "username"
            }]
        });
        return {
            year: revenue.year,
            total: revenue.amount,
            provisions: revenue.provisions as ProvisionDocument[]
        }
    }

    /**
     * Calculates the current month's revenue for a single user and retrieves from the database all the previous revenue entries
     * and forms a final object containing all revenues for each month for a specific user
     *
     * @param userId {string} User ID
     * @returns {Promise<RevenueMonths>} The object containing all months
     */
    public async calculateRevenuesMonthly(userId: string): Promise<RevenueMonths> {
        const defaultRevenueMonth: RevenueMonth = { amount: 0, provisions: [] };
        const months: Months = moment().locale("en").localeData().monthsShort()
            .map(m => m.toLowerCase())
            .reduce((o, key) => ({ ...o, [key]: defaultRevenueMonth }), {} as Months);
        const currentYear = new Date().getFullYear(), currentMonth = new Date().getMonth();

        const pastRevenues = await this.revenueService.find({
            user: userId,
            year: currentYear,
            month: { $lt: currentMonth }
        }, {
            populate: [{
                path: "provisions.letter",
                select: "sendAt subject kind"
            }, {
                path: "provisions.referrers.user",
                select: "username"
            }]
        });
        const currentRevenue = await this.calculateRevenue(userId, { month: currentMonth }, {
            populate: [{
                path: "letter",
                select: "sendAt subject kind"
            }, {
                path: "referrers.user",
                select: "username"
            }]
        });

        const revenueMonths = { ...months };
        pastRevenues.forEach(pastRevenue => revenueMonths[Object.keys(months)[pastRevenue.month]] = {
            amount: pastRevenue.amount,
            provisions: pastRevenue.provisions as ProvisionDocument[]
        });
        revenueMonths[Object.keys(months)[currentMonth]] = {
            amount: currentRevenue.amount,
            provisions: currentRevenue.provisions as ProvisionDocument[]
        };

        return {
            year: currentYear,
            total: Object.values(revenueMonths).reduce<number>((acc: number, cur: RevenueMonth) => acc + cur.amount, 0),
            ...revenueMonths
        };
    }

}
