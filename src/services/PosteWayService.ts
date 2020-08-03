import { provide } from "inversify-binding-decorators";
import {
    ConfirmResponse,
    RecipientsResponse,
    StatusResponse,
    Submit,
    SubmitKind,
    SubmitResponse,
    TrackResponse
} from "../posteway";
import { ReadStream } from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

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
        const json = await res.json();
        if (!res.ok) {
            throw {
                statusCode: res.status,
                posteway: json
            };
        }
        return json;
    }

    public async upload(pdf: ReadStream): Promise<{ cid: string }> {
        const form = new FormData();
        form.append("file", pdf, { contentType: "application/pdf" });

        return this.call("/upload", form, "POST");
    }

    public async send(submit: Submit): Promise<SubmitResponse> {
        return this.call("/send", JSON.stringify(submit), "POST", { "Content-Type": "application/json" });
    }

    public async status(kind: SubmitKind, requestId: string): Promise<StatusResponse> {
        return this.call(`/status/${kind}/${requestId}`);
    }

    public async confirm(kind: SubmitKind, requestId: string): Promise<ConfirmResponse> {
        return this.call("/confirm", JSON.stringify({ kind, requestId }), "POST", { "Content-Type": "application/json" });
    }

    public async cancel(kind: SubmitKind, requestId: string): Promise<void> {
        return this.call("/cancel", JSON.stringify({ kind, requestId }), "DELETE", { "Content-Type": "application/json" });
    }

    public async track(kind: SubmitKind, orderId: string): Promise<TrackResponse> {
        return this.call(`/track/${kind}/${orderId}`);
    }

    public async recipients(kind: SubmitKind, requestId: string): Promise<RecipientsResponse[]> {
        return this.call(`/recipients/${kind}/${requestId}`);
    }

}
