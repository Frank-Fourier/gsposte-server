export type SubmitKind = "lol" | "rol";

export type AddressKind = "normal" | "postal";

export interface Request {
    kind: SubmitKind
    requestId: string
    guid?: string
}

export interface Person {
    name?: string
    surname?: string
    businessName?: string
    postalOffice?: string
    postalBox?: string
    cf?: string
    address: {
        kind?: AddressKind
        street: string
        city: string
        fraction?: string
        zip: string
        province: string
        country?: string
    }
}

export interface Price {
    tot: number
    net: number
    tax: number
    cur: string
}

export interface PriceResponse {
    pages: number
    total: Price
    details: {
        price: Price
        description: string
        quantity: number
        vat: number
        vatCode: string
    }[]
}

export interface StatusResponse {
    request: Request
    status: string
    price: PriceResponse
}

export interface TrackInfo {
    number: string
    statusCode: string
    description: string
    date: string
}

export interface TrackResponse {
    requestId: string
    orderStatus: string
    requestStatus: string
    recipients: {
        id: string
        person: Person
        tracking?: TrackInfo
    }[]
}

export interface Submit {
    kind: SubmitKind
    sender: Person
    recipients: Person[]
    cid: string
    options?: {
        bw?: boolean
        backSide?: boolean
        foreign?: boolean
        ar?: boolean
        priority?: boolean
    }
}

export interface SubmitResponse {
    ok?: boolean
    request?: Request
    bad?: {
        recipient: Person
        error: {
            code: string
            description: string
        }
    }[]
}

export interface ConfirmResponse {
    orderId: string
    recipients: {
        receiptId: string
        number?: string
        epm?: string
    }[]
    price: PriceResponse
}

export interface Recipient {
    id: string
    person: Person
}
