import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "@services/MongoRepository";
import { Sender, senderDecoder, SenderDocument, SenderModel } from "@models/SenderModel";

@provide(SenderService)
export class SenderService extends MongoRepository<Sender, SenderDocument> {

    constructor(private senderModel = SenderModel) {
        super(senderModel, senderDecoder, [
            "name", "description", "address.street", "address.secondary", "address.city",
            "address.zip", "address.province", "address.country", "iva", "cf", "email", "notes"
        ]);
    }

}
