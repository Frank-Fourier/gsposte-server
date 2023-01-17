import { provide } from "inversify-binding-decorators";
import { Request, Response } from "express";
import { verifyOAuthAuthorization } from "@services/FicService";

@provide(FicController)
export class FicController {

    public async getFicToken(req: Request, res: Response) {
        const ficTokenResponse = await verifyOAuthAuthorization(req.header("Authorization"), req.body.responseUrl ?? "");

        return res.status(200).send({ currentState: "TOKEN_RECEIVED", requestUri: ficTokenResponse.requestUri });
    }
}
