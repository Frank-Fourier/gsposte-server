import { provide } from "inversify-binding-decorators";
import fetch from "node-fetch";
import { Sms, SmsStatusResponse } from "../sms";

@provide(SmsService)
export class SmsService {

    authenticate(): Promise<string> {
        return this.call(`/authenticate?password=${process.env.SMS_PASSWORD}&username=${process.env.SMS_USERNAME}`, {}, 'POST', { "Accept": "application/json" });
    }

    async sendSMS(sms: Sms, token?: string): Promise<SmsStatusResponse> {
        return this.call(`/extapi/sms/create`, sms, 'POST', { "X-Auth-Token": token ?? await this.authenticate() });
    }
    
    private async call<T = any>(path: string, body?: any, method?: string, headers?: { [key: string]: string }): Promise<T> {
        const res = await fetch(`${process.env.SMS_ENDPOINT}${path}`, {
            method: method || "GET",
            body: JSON.stringify(body),
            headers: {
                "Content-Type": "application/json", 
                "Cache-Control": "no-cache",
                ...(headers || {})
            }
        });
        return await res.json();
    }

}