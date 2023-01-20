import {
    Configuration,
    OAuth2AuthorizationCodeManager,
    OAuth2AuthorizationCodeTokenResponse
} from "@fattureincloud/fattureincloud-ts-sdk";

export enum FicMessage {
    GET_AUTHORIZATION_URL = "GET_AUTHORIZATION_URL",
    CREATE_OR_UPDATE_INVOICE = "CREATE_OR_UPDATE_INVOICE",
    IMPORT_ALL_FROM_FIC= "IMPORT_ALL_FROM_FIC"
}

export enum FicRequest {
    GET_LIST_VAT_TYPES = "GET_LIST_VAT_TYPES",
    GET_MY_COMPANY_ID = "GET_MY_COMPANY_ID",
    GET_LIST_PAYMENT_METHODS = "GET_LIST_PAYMENT_METHODS",
    CREATE_PAYMENT_ACCOUNT = "CREATE_PAYMENT_ACCOUNT",
    CREATE_INVOICE = "CREATE_INVOICE",
    MODIFY_INVOICE = "MODIFY_INVOICE",
    LIST_RECEIVED_DOCUMENTS = "LIST_RECEIVED_DOCUMENTS",
    GET_ISSUED_DOCUMENT = "GET_ISSUED_DOCUMENT"

}

export interface AuthorizeOAuth2ClientRequest {
    action: FicMessage,
    authorization: string,
    requestUri: string
}

export interface AuthorizeOAuth2Request extends AuthorizeOAuth2ClientRequest {
    oauth: OAuth2AuthorizationCodeManager,
    access?: OAuth2AuthorizationCodeTokenResponse,
    apiConfig?: Configuration
    companyId?: number
}

export interface FicTokenResponse extends OAuth2AuthorizationCodeTokenResponse {
    requestUri: string;
}

export class ErrorReports {
    knowErrors = {
        401: {
            title: "Non autorizzato",
            description: "Il token è mancante, non valido o scaduto. Per risolvere questo problema, devi eseguire nuovamente l'autenticazione."
        },
        403: {
            title: "Proibito",
            description: "L'utente o il token che stai utilizzando non dispone delle autorizzazioni appropriate per soddisfare la richiesta. Ciò può verificarsi anche se la licenza è scaduta o se hai raggiunto i limiti di utilizzo dell'API."
        },
        404: {
            title: "Non trovato",
            description: "La risorsa che stai cercando non esiste."
        },
        409: {
            title: "Conflitto",
            description: "Impossibile eseguire l'operazione."
        },
        422: {
            title: "Entità non elaborabile",
            description: "La richiesta non è valida. Questo può accadere se il corpo della richiesta non supera la convalida."
        },
        429: {
            title: "Troppe Richieste",
            description: "ILa tua applicazione sta effettuando troppe richieste e ha superato le quote . È necessario attendere il numero di secondi specificato nell'intestazione della risposta Retry-After prima di riprovare."
        },
        500: {
            title: "Errori del server",
            description: "Si è verificato un errore sui server di Fatture in Cloud. Questi errori sono rari. Se incontri uno di questi, ti preghiamo di contattarci."
        }
    };
}
