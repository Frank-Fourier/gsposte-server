import { MongoRepository } from "@services/MongoRepository";
import { Notice, NoticeDocument, NoticeDecoder, NoticeModel } from "@models/NoticeModel";
import { provide } from "inversify-binding-decorators";

@provide(NoticeService)
export class NoticeService extends MongoRepository<Notice, NoticeDocument> {

    constructor() {
        super(NoticeModel, NoticeDecoder);
    }

}
