import { CrudController } from "@controllers/CrudController";
import { inject } from "inversify";
import { NoticeService } from "@services/NoticeService";
import { provide } from "inversify-binding-decorators";
import { Request, Response } from "express";

@provide(NoticeController)
export class NoticeController extends CrudController {

    constructor(@inject(NoticeService) private noticeService: NoticeService) {
        super(noticeService, true, true);
    }

    public async read(req: Request, res: Response) {
        const marked = await this.noticeService.updateById(
            req.params.id, { $set: { read: true }}
        );
        return res.status(200).send(marked);
    }

}
