import { provide } from "inversify-binding-decorators";
import { LetterKind } from "@services/PostelService";
import { inject } from "inversify";
import { LetterService } from "@services/LetterService";
import { RubricService } from "@services/RubricService";
import { RecipientService } from "@services/RecipientService";
import { UserDocument } from "@models/UserModel";
import { groupBy, insert } from "@utils/misc";
import { LetterDocument } from "@models/LetterModel";
import { Price } from "../posteway";

/**
 * @swagger
 *
 * definitions:
 *   LetterStats:
 *     type: object
 *     properties:
 *       total:
 *         type: number
 *         description: Total number of letters created of this kind
 *         example: 10
 *       sent:
 *         type: number
 *         description: Total number of letters sent of this kind
 *         example: 4
 *       toSend:
 *         type: number
 *         description: Total number of letters to send of this kind
 *         example: 6
 *   Stats:
 *     type: object
 *     properties:
 *       letters:
 *         type: object
 *         properties:
 *           "LETTERA SEMPLICE":
 *             $ref: "#/definitions/LetterStats"
 *           "RACCOMANDATA":
 *             $ref: "#/definitions/LetterStats"
 *           "RACCOMANDATA AR":
 *             $ref: "#/definitions/LetterStats"
 *       counts:
 *         type: object
 *         properties:
 *           sent:
 *             type: number
 *             description: Total number of letters sent of all kinds
 *             example: 50
 *           scheduled:
 *             type: number
 *             description: Total number of letters to send of all kinds
 *             example: 23
 *           rubrics:
 *             type: number
 *             description: Total number of rubrics created
 *             example: 5
 *           recipients:
 *             type: number
 *             description: Total number of recipients
 *             example: 280
 *       spent:
 *         type: object
 *         properties:
 *           total:
 *             type: number
 *             description: Total cash spent on this account
 *             example: 420
 *           "LETTERA SEMPLICE":
 *             type: number
 *             description: Percent of cash spent on this kind of letter
 *             example: 15
 *           "RACCOMANDATA":
 *             type: number
 *             description: Percent of cash spent on this kind of letter
 *             example: 40
 *           "RACCOMANDATA AR":
 *             type: number
 *             description: Percent of cash spent on this kind of letter
 *             example: 45
 */
interface LetterStats {
    total: number
    sent: number
    toSend: number
}
export interface Stats {
    year?: number
    letters: {
        [LetterKind.LETTERA_SEMPLICE]: LetterStats
        [LetterKind.RACCOMANDATA]: LetterStats
        [LetterKind.RACCOMANDATA_AR]: LetterStats
    }
    counts: {
        sent: number
        scheduled: number
        rubrics: number
        recipients: number
    }
    spent: {
        total: number
        [LetterKind.LETTERA_SEMPLICE]: number
        [LetterKind.RACCOMANDATA]: number
        [LetterKind.RACCOMANDATA_AR]: number
    }
}

/**
 * @swagger
 *
 * definitions:
 *   PostePrice:
 *     type: object
 *     properties:
 *       net:
 *         type: number
 *         description: Net price
 *         example: 3.6
 *       tax:
 *         type: number
 *         description: Tax amount
 *         example: 0.2
 *       tot:
 *         type: number
 *         description: Total price (net + tax)
 *         example: 3.8
 *   PosteSpent:
 *     type: object
 *     properties:
 *       spent:
 *         description: How much you spent in total for this kind of letter
 *         $ref: "#/definitions/PostePrice"
 *   SystemSpentStats:
 *     type: object
 *     properties:
 *       year:
 *         type: number
 *         example: 2020
 *         description: Reference year. If missing, the stats refer to the entire lifetime of the database
 *       spent:
 *         description: How much you spent in total
 *         $ref: "#/definitions/PostePrice"
 *       "LETTERA SEMPLICE":
 *         $ref: "#/definitions/PosteSpent"
 *       "RACCOMANDATA":
 *         $ref: "#/definitions/PosteSpent"
 *       "RACCOMANDATA AR":
 *         $ref: "#/definitions/PosteSpent"
 */
export interface PosteSpent {
    spent?: Partial<Price>
}
export interface SystemSpentStats {
    year?: number
    spent: Partial<Price>
    [LetterKind.LETTERA_SEMPLICE]: PosteSpent
    [LetterKind.RACCOMANDATA]: PosteSpent
    [LetterKind.RACCOMANDATA_AR]: PosteSpent
}

@provide(StatsService)
export class StatsService {

    @inject(LetterService) private letterService: LetterService;
    @inject(RubricService) private rubricService: RubricService;
    @inject(RecipientService) private recipientService: RecipientService;

    /**
     * Calculates and returns stats for a single user
     *
     * @param user {UserDocument} User to fetch stats for
     * @param year {number} Optional year to calculate stats for. If not passed, it gets all the letters
     * @returns {Promise<Stats>} Object containing stats for the user
     */
    public async fetchStats(user: UserDocument, year?: number): Promise<Stats> {
        const letters = await this.letterService.find({
            ...insert(!user.isAdmin(), {
                user: user.id
            }),
            ...insert(!!year, {
                sendAt: {
                    $gte: `${year}-01-01`,
                    $lte: `${year}-12-31`
                }
            }),
            error: { $ne: true },
            posteway: { $exists: true }
        });

        const lettersByKind = groupBy<LetterDocument>(letters, letter => letter.kind);
        const aggregateStats = (letters: LetterDocument[]) => ({
            counts: {
                total: letters.length,
                sent: letters.filter(l => l.sent).length,
                toSend: letters.length - letters.filter(l => l.sent).length
            },
            spent: letters.reduce<number>((acc, l) => acc + (l.price * l.recipients.length), 0)
        });

        const stats = {
            [LetterKind.LETTERA_SEMPLICE]: aggregateStats(lettersByKind[LetterKind.LETTERA_SEMPLICE] || []),
            [LetterKind.RACCOMANDATA]: aggregateStats(lettersByKind[LetterKind.RACCOMANDATA] || []),
            [LetterKind.RACCOMANDATA_AR]: aggregateStats(lettersByKind[LetterKind.RACCOMANDATA_AR] || []),
        };

        const totalSpent = Object.values(stats).reduce<number>((acc, s) => acc + s.spent, 0);
        return {
            year: year,
            letters: {
                [LetterKind.LETTERA_SEMPLICE]: stats[LetterKind.LETTERA_SEMPLICE].counts,
                [LetterKind.RACCOMANDATA]: stats[LetterKind.RACCOMANDATA].counts,
                [LetterKind.RACCOMANDATA_AR]: stats[LetterKind.RACCOMANDATA_AR].counts
            },
            counts: {
                sent: Object.values(stats).reduce<number>((acc, s) => acc + s.counts.sent, 0),
                scheduled: Object.values(stats).reduce<number>((acc, s) => acc + s.counts.toSend, 0),
                rubrics: await this.rubricService.countDocuments(!user.isAdmin() ? { user: user } : {}),
                recipients: await this.recipientService.countDocuments(!user.isAdmin() ? { user: user } : {})
            },
            spent: {
                total: totalSpent,
                [LetterKind.LETTERA_SEMPLICE]: ((stats[LetterKind.LETTERA_SEMPLICE].spent) / totalSpent) * 100,
                [LetterKind.RACCOMANDATA]: ((stats[LetterKind.RACCOMANDATA].spent) / totalSpent) * 100,
                [LetterKind.RACCOMANDATA_AR]: ((stats[LetterKind.RACCOMANDATA_AR].spent) / totalSpent) * 100
            }
        }
    }

    /**
     * Calculates how much you spent sending letters from PosteWay
     * This calculation refers to letters sent in a specific year if specified
     *
     * @param year {number} Optional year to calculate stats for. If not passed, it gets all the letters
     * @returno9s {Promise<SystemSpentStats>} Object containing the stats
     */
    public async fetchSystemSpentStats(year?: number): Promise<SystemSpentStats> {
        const letters = (await this.letterService.find({
            ...insert(!!year, {
                sendAt: {
                    $gte: `${year}-01-01`,
                    $lte: `${year}-12-31`
                }
            }),
            sent: true,
            error: { $ne: true },
            posteway: { $exists: true }
        })).filter(l => !!l.posteway.prices);

        const lettersByKind = groupBy<LetterDocument>(letters, letter => letter.kind);
        const aggregatePrices = (letters: LetterDocument[]): PosteSpent =>
            letters.reduce((stats, { posteway: { prices } }) => ({
                spent: {
                    net: stats.spent.net + prices.total.net,
                    tax: stats.spent.tax + prices.total.tax,
                    tot: stats.spent.tot + (prices.total.tax === 0 ? prices.total.net : prices.total.tot),
                }
            }), { spent: { net: 0, tax: 0, tot: 0 } } as PosteSpent);

        const aggregated = {
            [LetterKind.LETTERA_SEMPLICE]: aggregatePrices(lettersByKind[LetterKind.LETTERA_SEMPLICE] || []),
            [LetterKind.RACCOMANDATA]: aggregatePrices(lettersByKind[LetterKind.RACCOMANDATA] || []),
            [LetterKind.RACCOMANDATA_AR]: aggregatePrices(lettersByKind[LetterKind.RACCOMANDATA_AR] || []),
        };

        return {
            year: year,
            spent: Object.values(aggregated).reduce<Partial<Price>>((acc, { spent }) => ({
                net: acc.net + spent.net,
                tax: acc.tax + spent.tax,
                tot: acc.tot + spent.tot
            }), { net: 0, tax: 0, tot: 0 }),
            ...aggregated
        }
    }

}
