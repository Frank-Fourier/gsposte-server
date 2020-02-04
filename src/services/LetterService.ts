import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { MongoRepository } from "@services/MongoRepository";
import { Letter, letterDecoder, LetterDocument, LetterModel } from "@models/LetterModel";
import { PostelService } from "@services/PostelService";

@provide(LetterService)
export class LetterService extends MongoRepository<Letter, LetterDocument> {

    @inject(PostelService) private postelService: PostelService;

    constructor(private letterModel = LetterModel) {
        super(letterModel, letterDecoder);
    }

}
