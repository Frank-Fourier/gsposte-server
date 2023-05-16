import {
    Company,
    Configuration,
    CreateIssuedDocumentRequest,
    CreatePaymentAccountRequest,
    InfoApi,
    IssuedDocument,
    IssuedDocumentOptions,
    IssuedDocumentsApi,
    OAuth2AuthorizationCodeManager,
    PaymentAccount,
    ReceivedDocument,
    ReceivedDocumentsApi,
    Scope,
    SettingsApi,
    UserApi,
    VatType
} from "@fattureincloud/fattureincloud-ts-sdk";
import httpErrors, { HttpError } from "http-errors";
import { logger } from "@utils/winston";
import {
    AuthorizeOAuth2ClientRequest,
    AuthorizeOAuth2Request,
    ErrorReports,
    FicRequest,
    FicTokenResponse
} from "@models/FicModel";
import { generateRandomCode } from "@utils/random";
import { number } from "@mojotech/json-type-validation";
import * as process from "process";

const SCOPES_ACCESS = [
    Scope.ENTITY_CLIENTS_READ,
    Scope.ENTITY_CLIENTS_ALL,
    Scope.ENTITY_SUPPLIERS_READ,
    Scope.ENTITY_SUPPLIERS_ALL,
    Scope.PRODUCTS_READ,
    Scope.PRODUCTS_ALL,
    Scope.ISSUED_DOCUMENTS_INVOICES_READ,
    Scope.ISSUED_DOCUMENTS_CREDIT_NOTES_READ,
    Scope.ISSUED_DOCUMENTS_RECEIPTS_READ,
    Scope.ISSUED_DOCUMENTS_ORDERS_READ,
    Scope.ISSUED_DOCUMENTS_QUOTES_READ,
    Scope.ISSUED_DOCUMENTS_PROFORMAS_READ,
    Scope.ISSUED_DOCUMENTS_DELIVERY_NOTES_READ,
    Scope.ISSUED_DOCUMENTS_WORK_REPORTS_READ,
    Scope.ISSUED_DOCUMENTS_SUPPLIER_ORDERS_READ,
    Scope.ISSUED_DOCUMENTS_SELF_INVOICES_READ,
    Scope.ISSUED_DOCUMENTS_INVOICES_ALL,
    Scope.ISSUED_DOCUMENTS_CREDIT_NOTES_ALL,
    Scope.ISSUED_DOCUMENTS_RECEIPTS_ALL,
    Scope.ISSUED_DOCUMENTS_ORDERS_ALL,
    Scope.ISSUED_DOCUMENTS_QUOTES_ALL,
    Scope.ISSUED_DOCUMENTS_PROFORMAS_ALL,
    Scope.ISSUED_DOCUMENTS_DELIVERY_NOTES_ALL,
    Scope.ISSUED_DOCUMENTS_WORK_REPORTS_ALL,
    Scope.ISSUED_DOCUMENTS_SUPPLIER_ORDERS_ALL,
    Scope.ISSUED_DOCUMENTS_SELF_INVOICES_ALL,
    Scope.RECEIVED_DOCUMENTS_READ,
    Scope.RECEIVED_DOCUMENTS_ALL,
    Scope.STOCK_READ,
    Scope.STOCK_ALL,
    Scope.RECEIPTS_READ,
    Scope.RECEIPTS_ALL,
    Scope.TAXES_READ,
    Scope.TAXES_ALL,
    Scope.ARCHIVE_READ,
    Scope.ARCHIVE_ALL,
    Scope.CASHBOOK_READ,
    Scope.CASHBOOK_ALL,
    Scope.SETTINGS_READ,
    Scope.SETTINGS_ALL,
    Scope.SITUATION_READ
];

const DEFAULT_REDIRECT_URI = process.env.DEFAULT_REDIRECT_URI;
let oAuth2Requests: AuthorizeOAuth2Request[] = [];
const requestState = generateRandomCode();
const errorReports = new ErrorReports();

export function findOauthRequest(authorization: string) {
    return oAuth2Requests.find(o => o.authorization === authorization);
}

async function getMyCompanyId(oauthRequest: AuthorizeOAuth2Request): Promise<number> {
    const userApi = new UserApi(oauthRequest.apiConfig);
    const { data: { data: { companies: companies } } } = await userApi.listUserCompanies();
    return companies.find((c: Company) => c.tax_code === process.env.FIC_COMPANY_VAT_NUMBER)?.id ?? 0;
}

async function getListVatTypes(oauthRequest: AuthorizeOAuth2Request): Promise<VatType[]> {
    const infoApi = new InfoApi(oauthRequest.apiConfig);
    const { data: { data } } = await infoApi.listVatTypes(oauthRequest.companyId);
    return data;
}

async function getPaymentAccounts(oauthRequest: AuthorizeOAuth2Request): Promise<PaymentAccount[]> {
    const infoApi = new InfoApi(oauthRequest.apiConfig);
    const { data: { data } } = await infoApi.listPaymentAccounts(oauthRequest.companyId);
    if (data.length === 0) {
        const created = await createPaymentAccount(oauthRequest, { key: FicRequest.CREATE_PAYMENT_ACCOUNT, object: {
                data: {
                    name: "Auto generated Payment Account",
                    type: "bank",
                    iban: process.env.FIC_IBAN
                }
            }});
        return [ created ];
    }
    return data;
}

async function createPaymentAccount(oauthRequest: AuthorizeOAuth2Request, params: object): Promise<PaymentAccount> {
    const settingApi = new SettingsApi(oauthRequest.apiConfig);
    const { data: { data } } = await settingApi.createPaymentAccount(oauthRequest.companyId, params as CreatePaymentAccountRequest);
    return data;
}

async function createOrModifyInvoice(oauthRequest: AuthorizeOAuth2Request, request: FicRequest, params: object): Promise<IssuedDocument> {
    if (request !== FicRequest.CREATE_INVOICE && request !== FicRequest.MODIFY_INVOICE) {
        throw new Error(`[FIC]: Error in createOrModifyInvoice function: Rivedere la chiave con la quale è stata generata la richiesta!`);
    }
    const issuedDocumentApi = new IssuedDocumentsApi(oauthRequest.apiConfig);
    if (request === FicRequest.MODIFY_INVOICE) {
        //const param = params.object as { invoiceId: number, obj: ModifyIssuedDocumentRequest };
        const { data: { data } } = await issuedDocumentApi.modifyIssuedDocument(oauthRequest.companyId,
            (params as { id: number, data: IssuedDocument, options: IssuedDocumentOptions }).id,
            params as { id: number, data: IssuedDocument, options: IssuedDocumentOptions })
        return data as IssuedDocument;
    }
    const { data: { data } } = await issuedDocumentApi.createIssuedDocument(oauthRequest.companyId, params as CreateIssuedDocumentRequest)
    return data as IssuedDocument;
}

async function getIssuedDocument(oauthRequest: AuthorizeOAuth2Request, params: object): Promise<IssuedDocument> {
    const api = new IssuedDocumentsApi(oauthRequest.apiConfig);
    const documentId = (params as { documentId: number }).documentId;
    const { data: { data } } = await api.getIssuedDocument(oauthRequest.companyId, documentId, null, "detailed");
    return data;
}

async function listReceivedDocuments(oauthRequest: AuthorizeOAuth2Request, params: object): Promise<ReceivedDocument[]> {
    const api = new ReceivedDocumentsApi(oauthRequest.apiConfig);
    const { data: { data } } = await api.listReceivedDocuments(oauthRequest.companyId,
        "expense",
        null,
        "detailed",
        "-date",
        1,
        10000,
        (params as { query: string }).query
    );
    return data;
}

export async function callFicApi(request: FicRequest,
                                 oauthRequest: AuthorizeOAuth2Request,
                                 params?: object,
                                 failed?: boolean): Promise<VatType[] | number | IssuedDocument | PaymentAccount | PaymentAccount[] | ReceivedDocument | ReceivedDocument[]> {
    try {
        switch (request) {
            case FicRequest.GET_LIST_VAT_TYPES:
                return (await getListVatTypes(oauthRequest)) as VatType[];

            case FicRequest.GET_MY_COMPANY_ID:
                return (await getMyCompanyId(oauthRequest)) as number;

            case FicRequest.CREATE_PAYMENT_ACCOUNT:
                return (await createPaymentAccount(oauthRequest, params)) as PaymentAccount;

            case FicRequest.GET_LIST_PAYMENT_METHODS:
                return (await getPaymentAccounts(oauthRequest)) as PaymentAccount[];

            case FicRequest.CREATE_INVOICE:
                return (await createOrModifyInvoice(oauthRequest, request, params)) as IssuedDocument;

            case FicRequest.MODIFY_INVOICE:
                return (await createOrModifyInvoice(oauthRequest, request, params)) as IssuedDocument;

            case FicRequest.LIST_RECEIVED_DOCUMENTS:
                return (await listReceivedDocuments(oauthRequest, params)) as ReceivedDocument[]

            case FicRequest.GET_ISSUED_DOCUMENT:
                return (await getIssuedDocument(oauthRequest, params)) as IssuedDocument

            default: return;
        }
    } catch (err) {
        const error = err as HttpError;
        const knowError: { title: string, description: string } = errorReports.knowErrors[(error?.response?.status ?? 500) as keyof typeof number];
        if (error?.response?.status === 401 && !failed) {
            await refreshToken(oauthRequest.authorization);
            return await callFicApi(request, findOauthRequest(oauthRequest.authorization), params, true);
        }
        const msg = error?.response?.data?.error.message ? error?.response?.data?.error.message : `Error in ${request}: ${knowError.title}: ${knowError.description}`;

        logger.error(msg);
        throw new Error(msg);
    }
}

export function authorizeOAuth2(request: AuthorizeOAuth2ClientRequest): string {
    const oauth = new OAuth2AuthorizationCodeManager(process.env.FIC_CLIENT_ID, process.env.FIC_CLIENT_SECRET, DEFAULT_REDIRECT_URI);
    oAuth2Requests = [...oAuth2Requests.filter(oauth => oauth.authorization !== request.authorization), { ...request, oauth }];

    return oauth.getAuthorizationUrl(SCOPES_ACCESS, requestState);
}

export async function verifyOAuthAuthorization(authorization: string, responseUrl: string): Promise<FicTokenResponse> {
    const oauthRequest = findOauthRequest(authorization);
    if (!oauthRequest) {
        throw new httpErrors.BadRequest("Ripetere la procedura di autenticazione con il provider di Fatture in Cloud!");
    }

    const { authorizationCode, state } = oauthRequest.oauth.getParamsFromUrl(responseUrl);
    if (state !== requestState) {
        throw new httpErrors.BadRequest("La richiesta non è partita da questo endpoint!");
    }

    oauthRequest.access = await oauthRequest.oauth.fetchToken(authorizationCode);
    oauthRequest.apiConfig = new Configuration({
        accessToken: oauthRequest.access.accessToken
    });
    oauthRequest.companyId = await callFicApi(FicRequest.GET_MY_COMPANY_ID, oauthRequest) as number;

    if (oauthRequest.companyId === 0) {
        throw new httpErrors.Conflict("L'account non dispone della compagnia selezionata! Rivedere la configurazione per il companyId!");
    }

    oAuth2Requests = [ ...oAuth2Requests.filter(oauth => oauth.authorization !== authorization), oauthRequest ];

    return { ...oauthRequest.access, requestUri: oauthRequest.requestUri };
}

export async function refreshToken(authorization: string) {
    const oauthRequest = findOauthRequest(authorization);
    if (!oauthRequest?.access) {
        throw new httpErrors.BadRequest("Ripetere la procedura di autenticazione con il provider di Fatture in Cloud!");
    }

    try {
        const newAccess = await oauthRequest.oauth.refreshToken(oauthRequest.access.refreshToken);
        const newConfiguration = new Configuration({
            accessToken: newAccess.accessToken
        });

        oAuth2Requests = [ ...oAuth2Requests.filter(oauth => oauth.authorization !== authorization),{
            ...oauthRequest,
            access: newAccess,
            apiConfig: newConfiguration
        }];

    } catch (err) {
        oAuth2Requests = oAuth2Requests.filter(o => o.authorization !== authorization);
        const e = err as Error;
        logger.error(e.message);

        throw e;
    }
}
