import { provide } from "inversify-binding-decorators";
import { SenderDocument } from "@models/SenderModel";
import { RecipientDocument } from "@models/RecipientModel";
import { Address } from "@models/schemas/AddressSchema";
import { toJson, toXml } from "xml2json";
import fetch, { Response } from "node-fetch";
import httpErrors from "http-errors";

export const POSTEL_API = "https://postpdx.postel.it";

export interface MpxUploadOptions {
    // Is always true in a test environment
    test: boolean
    // Used to determine the WorkProcessID to use for each envelope
    letterType: LetterKind
    // Unique UUID for this set of envelopes
    setID: string
    // MUST be a progressive number while in production (this is the starting number)
    envelopeID: number
    // If true, the same envelopeID will be used across all envelopes (it will not be increased)
    useSameEnvelopeID?: boolean
    // PDF details
    pdf: {
        // MUST be equal to the real number of pages of the FORMATTED PDF file
        pages: number
        // The *entire* PDF file as Base64
        base64: string
    }
}
export interface MpxUploadResponse {
    // Global result code
    // 0 - OK
    // 1 - Internal Server Error on Postel
    // 2 - XML not formatted correctly
    // 3 - Missing MPX tag
    // 4 - Missing Header tag (will never occur)
    // 5 - Authentication failed (wrong ZCode/Username/Password)
    // 6 - PDF file is too large
    // 7 - Platform configuration error
    // 8 - Cover generation error
    // 190 - Multiple errors, check messages
    code: number
    // The message associated to the global code
    message: string
    // Contains the response related to the entire Set, with errors (if present)
    set: {
        code: number
        message: string
        errors: Array<{
            code: number
            message: string
        }>
    }
    // Contains the response related to the PDF file, with errors (if present)
    pdf: {
        code: number
        message: string
        errors: Array<{
            code: number
            message: string
        }>
    }
    // Contains the responses related to all the Envelopes, with errors for each (if present)
    envelopes: Array<{
        name: string
        code: number
        message: string
        errors: Array<{
            code: number
            message: string
        }>
    }>
    // Appears only if there was a problem storing the index keys in the database
    indexDeclaration?: {
        code: number
        message: string
        errors: Array<{
            code: number
            message: string
        }>
    }
}

export interface MpxQueryOptions {
    sets: Array<{
        // The CustomerSetID value
        id: string,
        // True if you want to request GetRegLetterNote for this Set
        wantsRLN: boolean
    }>,
    // Array of CustomerEnvelopeID values
    envelopes: Array<number>
}
export interface MpxQueryResponse {
    // Global result code
    // 0 - OK
    // 1 - Internal Server Error on Postel
    // 2 - Exceeded max XML length
    // 3 - XML parse error
    // 4 - Missing MPXQuery tag (will never occur)
    // 5 - Missing Header tag (will never occur)
    // 6 - Authentication failed (wrong ZCode/Username/Password)
    globalCode: number
    // Query result code
    // 0 - OK
    // 1 - Max number of Set/Envelope children exceeded (100)
    queryCode: number
    // Contains info about all the sets you requested
    sets: Array<{
        // The code is related to the query itself:
        // 0 - OK
        // 1 - Found more than one record with provided query (conflict)
        // 2 - Set not found
        // 3 - Reached the max number of daily queries (100.000)
        // 4 - Request timed out
        // 5 - Invalid CustomerSetID
        // 6 - Invalid MPXSetID (will never occur)
        code: number
        // The status is related to the job for this set:
        // 1 - Approved
        // 2 - Job in progress
        // 3 - Completed
        // 4 - Offline
        // 5 - Yet to approve
        // 6 - Suspended
        // 7 - Cancelled
        status?: number
        // When the related job was uploaded (YYYY-MM-DD HH:MM:SS)
        dateUploaded?: string
        // When the related job was completed (YYYY-MM-DD HH:MM:SS)
        dateCompleted?: string
        // If you passed true to wantsRLN, this will contain all the envelopes from this set that have a registered code
        regLetterNote?: {
            // The status is related to the job for this reg letter note
            // 0 - OK
            // 1 - Found more than one record with provided query (conflict)
            // 2 - 'Codice Raccomandata' not yet assigned! (no reg letter found)
            // 3 - Reached the max number of daily queries (100.000)
            // 4 - Request timed out
            // 5 - Invalid CustomerSetID
            // 6 - Invalid MPXSetID (will never occur)
            code: number
            envelopes: Array<{
                // CustomerEnvelopeID value
                envelopeID: number
                // Info about the envelope
                fullName: string
                address: Address
                // 'Codice Raccomandata' assigned by Postel
                regLetterCode: string
                // When the related job was completed (YYYY-MM-DD HH:MM:SS)
                dateCompleted?: string
            }>
        }
    }>
    // Contains info about all the envelopes you requested
    envelopes: Array<{
        // The code is related to the query itself:
        // 0 - OK
        // 1 - Found more than one record with provided query (conflict)
        // 2 - Envelope not found
        // 3 - Reached the max number of daily queries (100.000)
        // 4 - Request timed out
        // 5 - Invalid CustomerSetID (will never occur?)
        // 6 - Invalid CustomerPdfID (will never occur)
        // 7 - Invalid CustomerEnvelopeID
        // 8 - Invalid MPXSetID (will never occur)
        // 9 - Invalid MPXPdfID (will never occur)
        // 10 - Invalid MPXEnvelopeID
        code: number
        // The ID of the set from where this envelope is coming
        setID?: string
        // The ID of this specific envelope
        envelopeID: number
        // The status is related to the job for this envelope:
        // 1 - Approved
        // 2 - Job in progress
        // 3 - Completed
        // 4 - Offline
        // 5 - Yet to approve
        // 6 - Suspended
        // 7 - Cancelled
        status?: number
        // When the related job was uploaded (YYYY-MM-DD HH:MM:SS)
        dateUploaded?: string
        // When the related job was completed (YYYY-MM-DD HH:MM:SS)
        dateCompleted?: string
    }>
}

export enum LetterKind {
    "LETTERA_SEMPLICE" = "LETTERA SEMPLICE",
    "RACCOMANDATA" = "RACCOMANDATA",
    "RACCOMANDATA_AR" = "RACCOMANDATA AR"
}
export const WorkProcessID = {
    "LETTERA SEMPLICE": "1089028",
    "RACCOMANDATA": "1089026",
    "RACCOMANDATA AR": "1089024",
};

export enum PostelStatus {
    Sconosciuto,
    Approvato,
    LavorazioneInCorso,
    Completato,
    Offline,
    DaApprovare,
    Sospeso,
    Annullato
}

// Utility method to convert XML entities that might be an array or an object into a pure array
const array = (entity: any): Array<any> => !entity ? [] : (entity instanceof Array ? entity : [ entity ]);

@provide(PostelService)
export class PostelService {

    /**
     * Call Postel to send letters through XML.
     *
     * @param sender - Who is sending these letters
     * @param recipients - People receiving these letters
     * @param options - Upload options. MUST be filled with valid data
     */
    public async upload(sender: SenderDocument, recipients: Array<RecipientDocument>, options: MpxUploadOptions): Promise<MpxUploadResponse> {
        const model = this.createUploadModel(sender, recipients, options);
        const xml = toXml(model, { sanitize: true });

        // Call Postel
        const res = await this.callPostelApi("Upload", xml);
        if (!res.ok) {
            throw new httpErrors.InternalServerError("Upload API call to Postel failed!");
        }

        return this.parseUploadResponse(await res.text());
    }

    public async query(options: MpxQueryOptions): Promise<MpxQueryResponse> {
        const model = this.createQueryModel(options);
        const xml = toXml(model, { sanitize: true });

        // Call Postel
        const res = await this.callPostelApi("MpxQuery", xml);
        if (!res.ok) {
            throw new httpErrors.InternalServerError("Query API call to Postel failed!");
        }

        return this.parseQueryResponse(await res.text());
    }

    public isUploadResponseOk(response: MpxUploadResponse): boolean {
        return ((response.set && response.set.code === 0) && (response.set.errors || []).length === 0) &&
               (response.envelopes && response.envelopes.every(e => e.code === 0 && (e.errors || []).length === 0)) &&
               ((response.pdf && response.pdf.code === 0) && (response.pdf.errors || []).length === 0);
    }

    private callPostelApi(apiName: "Upload" | "MpxQuery", xmlBody: string): Promise<Response> {
        return fetch(`${POSTEL_API}/${apiName}.ashx`, {
            method: "POST",
            headers: { "Content-Type": "application/xml" },
            body: xmlBody,
            timeout: 60000
        });
    }

    private parseUploadResponse(xmlResponse: string): MpxUploadResponse {
        const res: any = JSON.parse(toJson(xmlResponse));
        const parseErrors = (errorObj: any) => {
            if (!errorObj) return [];
            return Object.values(array(errorObj["Error"])).map((error: any) => {
                return {
                    code: error["Code"],
                    message: error["Message"]
                }
            });
        };

        // Extract different sections of the JSON and re-arrange them as an MpxUploadResponse object
        // Sorry for the mess, XMLs fucking suck lol
        return {
            code: res["MPX"]["Header"]["GlobalCode"],
            message: res["MPX"]["Header"]["Message"],
            set: res["MPX"]["Set"] ? {
                code: parseInt(res["MPX"]["Set"]["SetCode"] || "0"),
                message: res["MPX"]["Set"]["Message"] || "OK",
                errors: parseErrors(res["MPX"]["Set"]["Errors"])
            } : null,
            pdf: res["MPX"]["Set"] && res["MPX"]["Set"]["Pdf"] ? {
                code: parseInt(res["MPX"]["Set"]["Pdf"]["PdfCode"] || "0"),
                message: res["MPX"]["Set"]["Pdf"]["Message"] || "OK",
                errors: parseErrors(res["MPX"]["Set"]["Pdf"]["Errors"])
            } : null,
            envelopes: res["MPX"]["Set"] && res["MPX"]["Set"]["Pdf"] && res["MPX"]["Set"]["Pdf"]["Envelope"]
                ? array(res["MPX"]["Set"]["Pdf"]["Envelope"])
                    .map(envelope => {
                        return {
                            name: envelope["AddressLine1"] || "",
                            code: parseInt(envelope["EnvelopeCode"] || "0"),
                            message: envelope["Message"] || "OK",
                            errors: parseErrors(envelope["Errors"])
                        }
                    })
                : [],
            indexDeclaration: res["MPX"]["IndexDeclaration"] ? {
                code: parseInt(res["MPX"]["IndexDeclaration"]["IndexDeclarationCode"] || "0"),
                message: res["MPX"]["IndexDeclaration"]["Message"] || "OK",
                errors: parseErrors(res["MPX"]["IndexDeclaration"]["Errors"]),
            } : null,
        };
    }

    private parseQueryResponse(xmlResponse: string): MpxQueryResponse {
        const res: any = JSON.parse(toJson(xmlResponse));

        // Extract different sections of the JSON and re-arrange them as an MpxQueryResponse object
        // Sorry for the mess, XMLs fucking suck lol
        const header = res["MPXQuery"]["Header"];
        const qcs = res["MPXQuery"]["Queries"]["QueryCheckStatus"];

        // There *MIGHT* have been more than 1 GetRegLetterNote queries for a single API call
        const rln = !res["MPXQuery"]["Queries"]["GetRegLetterNote"] ? []
            : array(res["MPXQuery"]["Queries"]["GetRegLetterNote"]);

        return {
            globalCode: parseInt(header["GlobalCode"] || "-1"),
            queryCode: parseInt(qcs["Code"] || "-1"),
            sets: array(qcs["Set"]).map(set => {
                const setRLN = rln.find(l => {
                    if (l["Code"] === "0") return false;
                    const envelopes = array(l["Envelope"]);
                    if (envelopes.length === 0) return false;
                    return envelopes[0]["CustomerSetID"] === set["CustomerSetID"];
                });

                return {
                    code: parseInt(set["Code"] || "-1"),
                    status: set["Status"] ? parseInt(set["Status"]) : undefined,
                    dateUploaded: set["UploadDate"],
                    dateCompleted: set["NotifyDate"],
                    regLetterNote: !setRLN ? null : {
                        code: parseInt(setRLN["Code"] || "-1"),
                        envelopes: !setRLN ? [] : array(setRLN["Envelope"])
                            .map(envelope => {
                                return {
                                    envelopeID: envelope["CustomerEnvelopeID"],
                                    fullName: envelope["AddressLine1"],
                                    address: {
                                        street: envelope["AddressLine2"],
                                        secondary: envelope["AddressLine3"],
                                        city: envelope["City"],
                                        zip: envelope["CAP"],
                                        province: envelope["LocalCode"],
                                        country: envelope["CountryID"]
                                    },
                                    regLetterCode: envelope["CodRaccomandata"],
                                    dateCompleted: envelope["MailDate"]
                                }
                            })
                    }
                }
            }),
            envelopes: array(qcs["Envelope"]).map(envelope => {
                return {
                    code: parseInt(envelope["Code"] || "-1"),
                    setID: envelope["CustomerSetID"],
                    envelopeID: envelope["CustomerEnvelopeID"],
                    status: envelope["Status"] ? parseInt(envelope["Status"]) : undefined,
                    dateUploaded: envelope["UploadDate"],
                    dateCompleted: envelope["MailDate"]
                }
            })
        };
    }

    /**
     * Below you can find the private methods to create the JSON models that will be converted to XML
     * before calling the APIs. These follow strictly the documentation provided by Postel.
     */

    private createUploadModel(sender: SenderDocument, recipients: Array<RecipientDocument>, options: MpxUploadOptions): Object {
        const originalPages = Math.ceil(options.pdf.pages / recipients.length);
        return {
            MPX: {
                Header: {
                    ZCode: process.env.POSTEL_ZCODE,
                    Username: process.env.POSTEL_USERNAME,
                    Password: process.env.POSTEL_PASSWORD
                },
                Set: {
                    Test: process.env.NODE_ENV !== "production" ? "ON" : (options.test ? "ON" : "OFF"),
                    CustomerSetID: options.setID,
                    RagioneSocialeMittente: sender.name,
                    IndirizzoMittente: sender.address.street,
                    CapMittente: sender.address.zip,
                    CittaMittente: sender.address.city,
                    ProvinciaMittente: sender.address.province,
                    NazioneMittente: sender.address.country,
                    Pdf: {
                        NumPages: options.pdf.pages,
                        Envelope: recipients.map((recipient, index) => {
                            return {
                                PageStart: (index * originalPages) + 1,
                                PageEnd: (index * originalPages) + originalPages,
                                WorkProcessID: WorkProcessID[options.letterType],
                                CustomerEnvelopeID: options.envelopeID + (options.useSameEnvelopeID ? 0 : (index + 1)),
                                Data: {
                                    AddressLine1: { $t: recipient.fullName },
                                    AddressLine2: { $t: recipient.address.street },
                                    AddressLine3: { $t: recipient.address.secondary || "" },
                                    CAP: { $t: recipient.address.zip },
                                    City: { $t: recipient.address.city },
                                    LocalCode: { $t: recipient.address.province },
                                    Country: { $t: recipient.address.country },
                                },
                            }
                        }),
                        PdfByteCode64: { $t: options.pdf.base64 },
                    },
                },
            }
        };
    }

    private createQueryModel(options: MpxQueryOptions): Object {
        return {
            MPXQuery: {
                Header: {
                    ZCode: process.env.POSTEL_ZCODE,
                    Username: process.env.POSTEL_USERNAME,
                    Password: process.env.POSTEL_PASSWORD
                },
                Queries: {
                    QueryCheckStatus: {
                        Set: options.sets.map(set => {
                            return { CustomerSetID: set.id }
                        }),
                        Envelope: options.envelopes.map(eid => {
                            return { CustomerEnvelopeID: eid }
                        }),
                    },
                    GetRegLetterNote: options.sets.filter(set => set.wantsRLN).map(set => {
                        return { CustomerSetID: set.id }
                    }),
                },
            }
        };
    }

}
