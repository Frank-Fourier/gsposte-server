import { provide } from "inversify-binding-decorators";
import { LetterKind } from "@services/PostelService";
import { inject } from "inversify";
import { LetterService } from "@services/LetterService";
import { RubricService } from "@services/RubricService";
import { RecipientService } from "@services/RecipientService";

/**
 * @swagger
 *
 * definitions:
 *   LetterStats:
 *     type: object
 *     required:
 *       - total
 *       - sent
 *       - toSend
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
 *     required:
 *       - letters
 *       - counts
 *       - spent
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

@provide(StatsService)
export class StatsService {

    @inject(LetterService) private letterService: LetterService;
    @inject(RubricService) private rubricService: RubricService;
    @inject(RecipientService) private recipientService: RecipientService;

    /**
     * Calculates and returns stats for a single user
     *
     * @param user {string} User ID to fetch stats for
     * @returns {Promise<Stats>} Object containing stats for the user
     */
    public async fetchStats(user: string): Promise<Stats> {
        const fetchLetterStats = async (kind: LetterKind) => {
            const letters = await this.letterService.find({ user: user, kind: kind });
            const sent = letters.filter(l => l.sent).length;
            return {
                counts: {
                    total: letters.length,
                    sent: sent,
                    toSend: letters.length - sent
                },
                spent: letters.reduce<number>((acc, l) => acc + (l.price * l.recipients.length), 0)
            }
        };

        const stats = {
            [LetterKind.LETTERA_SEMPLICE]: await fetchLetterStats(LetterKind.LETTERA_SEMPLICE),
            [LetterKind.RACCOMANDATA]: await fetchLetterStats(LetterKind.RACCOMANDATA),
            [LetterKind.RACCOMANDATA_AR]: await fetchLetterStats(LetterKind.RACCOMANDATA_AR),
        };

        const totalSpent = Object.values(stats).reduce<number>((acc, s) => acc + s.spent, 0);
        return {
            letters: {
                [LetterKind.LETTERA_SEMPLICE]: stats[LetterKind.LETTERA_SEMPLICE].counts,
                [LetterKind.RACCOMANDATA]: stats[LetterKind.RACCOMANDATA].counts,
                [LetterKind.RACCOMANDATA_AR]: stats[LetterKind.RACCOMANDATA_AR].counts
            },
            counts: {
                sent: Object.values(stats).reduce<number>((acc, s) => acc + s.counts.sent, 0),
                scheduled: Object.values(stats).reduce<number>((acc, s) => acc + s.counts.toSend, 0),
                rubrics: await this.rubricService.countDocuments({ user: user }),
                recipients: await this.recipientService.countDocuments({ user: user })
            },
            spent: {
                total: totalSpent,
                [LetterKind.LETTERA_SEMPLICE]: ((stats[LetterKind.LETTERA_SEMPLICE].spent) / totalSpent) * 100,
                [LetterKind.RACCOMANDATA]: ((stats[LetterKind.RACCOMANDATA].spent) / totalSpent) * 100,
                [LetterKind.RACCOMANDATA_AR]: ((stats[LetterKind.RACCOMANDATA_AR].spent) / totalSpent) * 100
            }
        }
    }

}
