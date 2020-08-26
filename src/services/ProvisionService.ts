import { MongoRepository } from "@services/MongoRepository";
import { Provision, provisionDecoder, ProvisionDocument, ProvisionModel } from "@models/ProvisionModel";
import { provide } from "inversify-binding-decorators";
import { LetterDocument } from "@models/LetterModel";
import { inject } from "inversify";
import { PriceService } from "@services/PriceService";
import { UserService } from "@services/UserService";
import { UserDocument } from "@models/UserModel";
import provisionJson from "../../provisions.json";

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

@provide(ProvisionService)
export class ProvisionService extends MongoRepository<Provision, ProvisionDocument> {

    @inject(PriceService) private priceService: PriceService;
    @inject(UserService) private userService: UserService;

    constructor(private provisionModel = ProvisionModel) {
        super(provisionModel, provisionDecoder);
    }

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
            revenue: revenue,
            spent: spent,
            weight: weight,
            referrers: referrers.map((referrer, index) => ({
                // For each referrer calculate percentage of the total provision (if present)
                user: referrer,
                amount: revenue * percents[index] / 100,
                percent: percents[index]
            }))
        });
    }

}
