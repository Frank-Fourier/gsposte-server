import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "@services/MongoRepository";
import { Recipient, recipientDecoder, RecipientDocument, RecipientModel } from "@models/RecipientModel";

@provide(RecipientService)
export class RecipientService extends MongoRepository<Recipient, RecipientDocument> {

    constructor(private recipientModel = RecipientModel) {
        super(recipientModel, recipientDecoder);
    }

}
