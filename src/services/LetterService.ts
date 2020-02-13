import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "@services/MongoRepository";
import { Letter, letterDecoder, LetterDocument, LetterModel } from "@models/LetterModel";

@provide(LetterService)
export class LetterService extends MongoRepository<Letter, LetterDocument> {

    constructor(private letterModel = LetterModel) {
        super(letterModel, letterDecoder);
    }

}
