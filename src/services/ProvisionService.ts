import { MongoQuery, MongoRepository, QueryOptions } from "@services/MongoRepository";
import { Provision, provisionDecoder, ProvisionDocument, ProvisionModel } from "@models/ProvisionModel";
import { provide } from "inversify-binding-decorators";
import { LetterDocument } from "@models/LetterModel";
import { inject } from "inversify";
import { PriceService, WeightRanges } from "@services/PriceService";
import { UserService } from "@services/UserService";
import { ProvisionPayment, UserDocument } from "@models/UserModel";
import { Types } from "mongoose";
import moment from "moment";
import provisionConfig from "../../provisions.json";
import httpErrors from "http-errors";

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
export interface Revenue {
    user: string | UserDocument
    year: number
    month: number
    amount: number
    provisions: Array<ProvisionDocument | string>
}
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

/**
 * @swagger
 *
 * definitions:
 *   DueRevenue:
 *     type: object
 *     properties:
 *       due:
 *         type: number
 *         description: How much revenue this user needs to be paid
 *       paid:
 *         type: number
 *         description: How much revenue has already been paid for this user
 */
export interface DueRevenue {
    due: number
    paid: number
}

@provide(ProvisionService)
export class ProvisionService extends MongoRepository<Provision, ProvisionDocument> {

    @inject(PriceService) private priceService: PriceService;
    @inject(UserService) private userService: UserService;

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
            // Just return the already existing provision
            return (await letter.populate("provision").execPopulate()).provision as ProvisionDocument;
        }

        const { percents, ranges } = provisionConfig as ProvisionRanges;
        const { user } = await letter.populate("user").execPopulate();

        // Calculate the amount of total provision
        const { weight } = await this.priceService.calculateWeight(letter);
        const amountKey = Object.keys(ranges[letter.kind]).filter((range: WeightRanges) => {
            const [ lower, upper ] = range.split("-");
            return parseFloat(lower) <= weight && parseFloat(upper) >= weight;
        })[0] as WeightRanges;

        const revenue = ranges[letter.kind][amountKey] * letter.recipients.length;
        const spent = letter.getTotalPrice(letter.recipientsGift);

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
     * @param month {number} Optional specific month to pass in the revenue
     * @param year
     * @returns {Promise<Revenue>} Revenue object
     */
    public async calculateRevenue(userId: string, query?: MongoQuery<Provision> | any, options?: QueryOptions, month?: number, year?: number): Promise<Revenue> {
        const provisions = await this.find({
            ...query,
            referrers: { $elemMatch: { user: userId } }
        }, options || {});
        return {
            user: userId,
            year: year || new Date().getFullYear(),
            month: month,
            provisions: provisions,
            amount: provisions.reduce<number>((acc, cur) => acc + this.getAmountForUserId(cur, userId), 0),
        };
    }

    /**
     * Calculates the current year's revenue for a single user
     *
     * @param userId {string} User ID
     * @param year {number} Optional year
     * @returns {Promise<RevenueMonths>} The object containing all months
     */
    public async calculateRevenueYearly(userId: string, year?: number): Promise<RevenueYears> {
        year = !year ? new Date().getFullYear() : year;
        const revenue = await this.calculateRevenue(userId, {
            createdAt: {
                $gte: new Date(year, 0, 1),
                $lte: new Date(year, 11, 31)
            }
        }, {
            populate: [{
                path: "letter",
                select: "sendAt subject kind"
            }, {
                path: "referrers.user",
                select: "username"
            }]
        }, undefined, year);
        return {
            year: revenue.year,
            total: parseFloat(revenue.amount.toFixed(2)),
            provisions: revenue.provisions as ProvisionDocument[]
        }
    }

    /**
     * Calculates the current month's revenue for a single user and retrieves from the database all the previous revenue entries
     * and forms a final object containing all revenues for each month for a specific user
     *
     * @param userId {string} User ID
     * @param year {number} Reference year
     * @returns {Promise<RevenueMonths>} The object containing all months
     */
    public async calculateRevenuesMonthly(userId: string, year: number): Promise<RevenueMonths> {
        const defaultRevenueMonth: RevenueMonth = { amount: 0, provisions: [] };
        const currentMonth = year === new Date().getFullYear() ? new Date().getMonth() : 11;

        const months: Months = moment().locale("en").localeData().monthsShort()
            .map(m => m.toLowerCase())
            .reduce((o, key) => ({ ...o, [key]: defaultRevenueMonth }), {} as Months);

        const revenues = await Promise.all([ ...Array(currentMonth + 1).keys() ].map(month =>
            this.calculateRevenue(userId, {
                month: month,
                createdAt: {
                    $gte: new Date(year, 0, 1),
                    $lte: new Date(year, 11, 31)
                }
            }, {
                populate: [{
                    path: "letter",
                    select: "sendAt subject kind"
                }, {
                    path: "referrers.user",
                    select: "username"
                }]
            }, month, year)
        ));

        const revenueMonths = { ...months };
        revenues.forEach(revenue => revenueMonths[Object.keys(months)[revenue.month]] = {
            amount: revenue.amount,
            provisions: revenue.provisions as ProvisionDocument[]
        });

        return {
            year: year,
            total: Object.values(revenueMonths).reduce<number>((acc: number, cur: RevenueMonth) => acc + cur.amount, 0),
            ...revenueMonths
        };
    }

    /**
     * Calculates the total due revenue for a specific user
     * "Due revenue" means how much money this user can request (based on his paid invoices)
     *
     * @param user {UserDocument} The user
     * @returns {Promise<DueRevenue>} Object containing the total to request and how much has been paid
     */
    public async calculateTotalDueRevenue(user: UserDocument): Promise<DueRevenue> {
        const [{ total_due }] = await this.provisionModel.aggregate([
            /**
             * AGGREGATE PIPELINE SPIEGATA
             * Effettua il match: passano solo i documenti che hanno nell'array 'referrers' lo user id interessato
             */
            {
                $match: {
                    referrers: {
                        $elemMatch: { user: Types.ObjectId(user.id) }
                    }
                }
            },
            /**
             * Effettua il left join sulla tabella letters per trovare la lettera corrispondente a questa provvigione.
             * Il risultato va a finire nell'array 'letter'
             */
            {
                $lookup: {
                    from: "letters",
                    localField: "letter",
                    foreignField: "_id",
                    as: "letter"
                }
            },
            /**
             * Dato che la relazione Provision/Letter è one-to-one, rendo l'array 'letter' un oggetto singolo
             */
            {
                $unwind: {
                    path: "$letter"
                }
            },
            /**
             * Effettua il left join sulla tabella invoices per trovare la fattura corrispondente a questa lettera (se esiste).
             * Il risultato va a finire nell'array 'invoice'
             */
            {
                $lookup: {
                    from: "invoices",
                    localField: "letter.invoice",
                    foreignField: "_id",
                    as: "invoice"
                }
            },
            /**
             * Dato che la relazione Letter/Invoice è one-to-one, rendo l'array 'letter' un oggetto singolo
             */
            {
                $unwind: {
                    path: "$invoice"
                }
            },
            /**
             * Effettua il match: passano solo i documenti che hanno fattura segnata come pagata
             */
            {
                $match: {
                    "invoice.paid": true
                }
            },
            /**
             * Proietta nell'array 'referrer' solo il referrer relativo all'utente interessato.
             * Questo al fine di recuperare il valore di 'amount' in seguito.
             */
            {
                $project: {
                    referrer: {
                        $filter: {
                            input: "$referrers",
                            as: "referrer",
                            cond: { $eq: [ "$$referrer.user", Types.ObjectId(user.id) ] }
                        }
                    }
                }
            },
            /**
             * So bene che, se esiste, il match è singolo nell'array 'referrer', quindi posso unwindare
             */
            {
                $unwind: {
                    path: "$referrer"
                }
            },
            /**
             * Effettuo una group by di tutti gli array 'referrer' così composti, ottenendo un singolo documento
             * con un unico array complessivo
             */
            {
                $group: {
                    _id: 0,
                    referrers: {
                        $push: "$referrer"
                    }
                }
            },
            /**
             * Da questo array complessivo effettuo la reduce per sommare tutti gli amount,
             * e metto il valore definitivo in total_due. Infine, lo proietto come valore finale
             * dell'aggregation.
             */
            {
                $project: {
                    _id: 0,
                    total_due: {
                        $reduce: {
                            input: "$referrers",
                            initialValue: 0,
                            in: {
                                $add: ["$$value", "$$this.amount"]
                            }
                        }
                    }
                }
            }
        ]).exec();
        if (total_due === null || total_due === undefined) {
            throw new httpErrors.InternalServerError("Failed to calculate total due");
        }

        const payments = this.getUserTotalProvisionPayments(user);
        return {
            due: total_due - payments,
            paid: payments,
        }
    }

    getAmountForUserId(provision: ProvisionDocument, userId: string) {
        return provision.depopulate("referrers.user").referrers.find((ref: any) => ref.user.toString() === userId)?.amount ?? 0;
    }

    getUserTotalProvisionPayments(user: UserDocument) {
        return user.provisionPayments?.reduce((acc: number, cur: ProvisionPayment) => acc + cur.amount, 0) ?? 0;
    }

}
