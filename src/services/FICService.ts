import { provide } from "inversify-binding-decorators";
import fetch from "node-fetch";
import { FIC } from "@models/fattureincloud/Documenti";

@provide(FICService)
export class FICService {

    documenti = {
        fatture: {
            nuovo: (fattura: FIC.DocNuovoRequest) =>
                this.call<FIC.DocNuovoRequest, FIC.NuovoDocumentoResponse>(`/${FIC.TipoDoc.FATTURE}/nuovo`, fattura)
        }
    }

    private async call<B, R>(path: string, body?: B): Promise<R | FIC.Error> {
        const res = await fetch(`${process.env.FIC_API_ENDPOINT}${path}`, {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        });
        return res.json();
    }

}
