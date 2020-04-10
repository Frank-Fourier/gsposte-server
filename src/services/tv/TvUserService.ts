import { provide } from "inversify-binding-decorators";
import { MongoRepository } from "@services/MongoRepository";
import { TvUser, tvUserDecoder, TvUserDocument, TvUserModel } from "@models/tv/TvUserModel";

@provide(TvUserService)
export class TvUserService extends MongoRepository<TvUser, TvUserDocument> {

    constructor(private tvUserModel = TvUserModel) {
        super(tvUserModel, tvUserDecoder, [
            "username", "email"
        ]);
    }

}
