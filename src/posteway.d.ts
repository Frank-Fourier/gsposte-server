export type SubmitKind = "lol" | "rol" | "runo" | "tol";

export type AddressKind = "normal" | "postal";

export interface Request {
    kind: SubmitKind
    requestId: string
    guid?: string
}

export interface Address {
    kind?: AddressKind
    street: string
    city: string
    fraction?: string
    zip: string
    province: string
    country?: string
    notes?: string
}

export interface Person {
    name?: string
    surname?: string
    businessName?: string
    postalOffice?: string
    postalBox?: string
    cf?: string
    notes?: string
    address: Address
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
    recipientAR?: Person
    cid?: string
    pdf?: string
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

export interface SoapCredentials {
    username: string
    password: string
    test?: boolean
}

export interface ApiToken {
    code: string
    expiresAt: Date
    enabled: boolean
}

export enum PW_UserRoles {
    ROLE_USER = "ROLE_USER",
    ROLE_PRINTER = "ROLE_PRINTER",
    ROLE_ADMIN = "ROLE_ADMIN",
}

export interface PW_User {
    businessName: string
    email: string
    password: string
    iva: string
    roles: PW_UserRoles[]
    credentials?: SoapCredentials
    tokens?: Array<ApiToken>
    active: boolean
    sender?: string | PW_User
}

export enum LetterWorkStatus {
    WAITING = "IN ATTESA",
    PRINTED = "STAMPATA",
    SENT = "INVIATA",
}

export interface PW_Letter {
    user?: string | PW_User
    platform: string
    code: string
    kind: SubmitKind
    sender: Person
    recipient: Person
    recipientAR?: Person
    avatarUrl?: string
    pdf: string
    options: {
        bw?: boolean
        backSide?: boolean
        ar?: boolean
    }
}

export interface PW_LetterDocument extends PW_Letter {
    _id: string
    status: LetterWorkStatus
    price: number
    tracking?: string
    printDate?: string
}

export interface PW_PaginateResult<T> {
    docs: T[];
    totalDocs: number;
    limit: number;
    page?: number;
    totalPages: number;
    nextPage?: number | null;
    prevPage?: number | null;
    pagingCounter: number;
    hasPrevPage: boolean;
    hasNextPage: boolean;
    meta?: any;
    [customLabel: string]: T[] | number | boolean | null | undefined;
}

/// TELEGRAMS

export interface GenericResponse {
    ok: boolean
    description: string
}

export interface TelegramTicket {
    id?: string
    recipientId?: number
    serviceId?: string
    message: string
}

export interface TelegramConfirmResponse {
    message?: string
    tickets?: Array<TelegramTicket>
}

export interface TelegramStatusResponse {
    telegrams: Array<{
        id: string
        part: number
        state: string
    }>
}

export interface TelegramSubmit {
    sender: Person
    recipients: Array<Person>
    text: string
    notes?: string
    showSenderAddress?: boolean
}

export interface TelegramSubmitResponse {
    ok: boolean
    requestId: string
    submitResult?: {
        text: string
        price: {
            words: number
            net: number
            tax: number
            total: number
        }
    }
    validationResult?: {
        description: string
        results: Array<{
            recipientId: string
            correctAddress: Address
            result: string
        }>
    }
}
