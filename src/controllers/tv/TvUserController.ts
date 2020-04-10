import { CrudController } from "@controllers/CrudController";
import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import { TvUserService } from "@services/tv/TvUserService";
import { UserRoles } from "@models/UserModel";

@provide(TvUserController)
export class TvUserController extends CrudController {

    constructor(@inject(TvUserService) private tvUserService: TvUserService) {
        super(tvUserService, true, false, UserRoles.ROLE_TV_MANAGER);
    }

}
