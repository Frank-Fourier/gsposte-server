import { provide } from "inversify-binding-decorators";
import {
    ConfirmResponse,
    PW_Letter,
    PW_LetterDocument,
    Recipient,
    StatusResponse,
    Submit,
    SubmitKind,
    SubmitResponse, TelegramConfirmResponse, TelegramStatusResponse, TelegramSubmit, TelegramSubmitResponse,
    TrackResponse
} from "../posteway";
import { ReadStream } from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

@provide(PosteWayService)
export class PosteWayService {

    upload(pdf: ReadStream): Promise<{ cid: string }> {
        const form = new FormData();
        form.append("file", pdf, { contentType: "application/pdf" });

        return this.call("/upload", form, "POST");
    }

    send(submit: Submit): Promise<SubmitResponse> {
        return this.call("/send", submit, "POST", { "Content-Type": "application/json" });
    }

    status(kind: SubmitKind, requestId: string): Promise<StatusResponse> {
        return this.call(`/status/${kind}/${requestId}`);
    }

    confirm(kind: SubmitKind, requestId: string): Promise<ConfirmResponse> {
        return this.call("/confirm", { kind, requestId }, "POST", { "Content-Type": "application/json" });
    }

    // public async cancel(kind: SubmitKind, requestId: string): Promise<void> {
    //     return this.call("/cancel", { kind, requestId }, "DELETE", { "Content-Type": "application/json" });
    // }

    track(kind: SubmitKind, orderId: string): Promise<TrackResponse> {
        return this.call(`/track/${kind}/${orderId}`);
    }

    recipients(kind: SubmitKind, requestId: string): Promise<Recipient[]> {
        return this.call(`/recipients/${kind}/${requestId}`);
    }

    cds_create_bulk(letters: PW_Letter[], pdf: string): Promise<{ letters: PW_LetterDocument[], pages: number }> {
        return this.call(`/letter/bulk`, { letters, pdf }, "POST", { "Content-Type": "application/json" })
    }

    cds_find(code: string): Promise<PW_LetterDocument[]> {
        return this.call(`/letter/query`, { query: { code }, paginate: false }, "POST", { "Content-Type": "application/json" });
    }

    send_telegram(submit: TelegramSubmit): Promise<TelegramSubmitResponse> {
        return this.call(`/telegrams/send`, submit, "POST", { "Content-Type": "application/json" });
    }

    status_telegram(requestId: string): Promise<TelegramStatusResponse> {
        return this.call(`/telegrams/status/${requestId}`);
    }

    confirm_telegram(requestId: string): Promise<TelegramConfirmResponse> {
        return this.call(`/telegrams/confirm/${requestId}`, {}, "POST", { "Content-Type": "application/json" });
    }

    private async call<T = any>(path: string, body?: any, method?: string, headers?: { [key: string]: string }): Promise<T> {
        const res = await fetch(`${process.env.PW_ENDPOINT}${path}`, {
            method: method || "GET",
            body: JSON.stringify(body),
            headers: {
                "PW-AccessToken": process.env.PW_TOKEN,
                ...(headers || {})
            }
        });
        const text = await res.text();

        if (!res.ok && text.startsWith("<")) {
            throw {
                statusCode: res.status,
                posteway: text
            };
        }

        const json = JSON.parse(text);
        if (!res.ok) {
            throw {
                statusCode: res.status,
                posteway: json
            };
        }

        return json;
    }

}
