import { MongoRepository } from "@services/MongoRepository";
import { Rubric, rubricDecoder, RubricDocument, RubricModel } from "@models/RubricModel";

export class RubricService extends MongoRepository<Rubric, RubricDocument> {

    constructor(private rubricModel = RubricModel) {
        super(rubricModel, rubricDecoder, [
            "name", "notes"
        ]);
    }

}
