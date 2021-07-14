export interface SmsStatusResponse {
    detail: string,
    code: number
}

export interface Sms {
    to: string,
    from: string,
    text: string,
}