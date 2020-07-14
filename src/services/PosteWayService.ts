import { provide } from "inversify-binding-decorators";
import fetch from "node-fetch";
import FormData from "form-data";
import {
    ConfirmResponse,
    Person,
    StatusResponse,
    Submit,
    SubmitKind,
    SubmitResponse,
    TrackResponse
} from "../posteway";

@provide(PosteWayService)
export class PosteWayService {

    private async call(path: string, body?: any, method?: string, headers?: { [key: string]: string }): Promise<any> {
        const res = await fetch(`${process.env.PW_ENDPOINT}${path}`, {
            method: method || "GET",
            body: body,
            headers: {
                "PW-AccessToken": process.env.PW_TOKEN,
                ...(headers || {})
            }
        });
        return await res.json();
    }

    public async upload(pdf: Buffer): Promise<{ cid: string }> {
        const form = new FormData();
        form.append("file", pdf, { contentType: "application/pdf" });

        return this.call("/upload", form, "POST");
    }

    public async send(submit: Submit): Promise<SubmitResponse> {
        return this.call("/send", submit, "POST");
    }

    public async status(kind: SubmitKind, requestId: string): Promise<StatusResponse> {
        return this.call(`/status/${kind}/${requestId}`);
    }

    public async confirm(kind: SubmitKind, requestId: string): Promise<ConfirmResponse> {
        return this.call("/confirm", { kind, requestId }, "POST");
    }

    public async cancel(kind: SubmitKind, requestId: string): Promise<void> {
        return this.call("/cancel", { kind, requestId }, "DELETE");
    }

    public async track(kind: SubmitKind, orderId: string): Promise<TrackResponse> {
        return this.call(`/track/${kind}/${orderId}`);
    }

    public async recipients(kind: SubmitKind, requestId: string): Promise<{ id: string, person: Person }[]> {
        return this.call(`/recipients/${kind}/${requestId}`);
    }

}
