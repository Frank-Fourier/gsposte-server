import { provide } from "inversify-binding-decorators";
import fetch from "node-fetch";

@provide(FICService)
export class FICService {



    private async call<B, R>(path: string, body?: B): Promise<R> {
        const res = await fetch(`${process.env.FIC_API_ENDPOINT}${path}`, {
            method: "POST",
            body: body as any,
        });
        const json = await res.json();
        if (!json.success) {
            throw json;
        }
        return json;
    }

}
