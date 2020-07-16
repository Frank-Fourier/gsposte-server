import { UserDocument } from "@models/UserModel";
import { expect } from "chai";
import { ioc } from "@ioc";
import { AuthService } from "@services/AuthService";
import { UserService } from "@services/UserService";
import { Sender, SenderDocument } from "@models/SenderModel";
import { Recipient, RecipientDocument } from "@models/RecipientModel";
import { Rubric, RubricDocument } from "@models/RubricModel";
import { Address, AddressDocument } from "@models/schemas/AddressSchema";
import { Letter, LetterDocument } from "@models/LetterModel";
import { Price, PriceDocument, PriceModel } from "@models/PriceModel";
import { MunicipalityService } from "@services/MunicipalityService";
import fs from "fs";
import prices from "../test/assets/json/prices.json";
import { Invoice, InvoiceDocument } from "@models/InvoiceModel";

export const TEST_CODE_PDF = "GSTESTPDF21";

export function assertSameUser(original: UserDocument, candidate: UserDocument) {
    expect(candidate).to.exist;
    expect(candidate.username).to.equal(original.username);
    expect(candidate.email).to.equal(original.email);
    expect(candidate.password).to.equal(original.password);
    expect(candidate._id.toString()).to.equal(original._id.toString());
}

export function assertSameSender(original: Sender | SenderDocument, candidate: SenderDocument) {
    expect(candidate).to.exist;
    expect(candidate.user.toString()).to.equal(original.user.toString());
    expect(candidate.name).to.equal(original.name);
    expect(candidate.description).to.equal(original.description);
    expect(candidate.businessName).to.equal(original.businessName);
    expect(candidate.invoiceCode).to.equal(original.invoiceCode);
    expect(candidate.iva).to.equal(original.iva);
    expect(candidate.cf).to.equal(original.cf);
    expect(candidate.email).to.equal(original.email.trim().toLowerCase());
    expect(candidate.notes).to.equal(original.notes);
    assertSameAddress(original.address, candidate.address);
}

export function assertSameRecipient(original: Recipient | RecipientDocument, candidate: RecipientDocument) {
    expect(candidate).to.exist;
    expect(candidate.user.toString()).to.equal(original.user.toString());
    expect(candidate.notes).to.equal(original.notes);
    assertSameAddress(original.address, candidate.address);
}

export function assertSameRubric(original: Rubric | RubricDocument, candidate: RubricDocument) {
    expect(candidate).to.exist;
    expect(candidate.user.toString()).to.equal(original.user.toString());
    expect(candidate.name).to.equal(original.name);
    expect(candidate.recipients).to.eql(original.recipients);
    expect(candidate.notes).to.equal(original.notes);
}

export function assertSameAddress(original: Address | AddressDocument, candidate: AddressDocument) {
    expect(candidate).to.exist;
    expect(candidate.street).to.equal(original.street);
    expect(candidate.secondary).to.equal(original.secondary);
    expect(candidate.city).to.equal(original.city);
    expect(candidate.zip).to.equal(original.zip);
    expect(candidate.province).to.equal(original.province);
    expect(candidate.country).to.equal(original.country);
}

export function assertSameLetter(original: Letter | LetterDocument, candidate: LetterDocument) {
    expect(candidate).to.exist;
    expect(candidate.user.toString()).to.equal(original.user.toString());
    expect(candidate.sender.toString()).to.equal(original.sender.toString());
    expect(candidate.recipients.map(r => r.toString()).join()).to.eql(original.recipients.toString());
    expect(candidate.subject).to.equal(original.subject);
    if (original.sendAt) expect(candidate.sendAt).to.eql(original.sendAt);
    expect(candidate.kind).to.equal(original.kind);
    expect(candidate.codePdf).to.equal(original.codePdf);
    expect(candidate.notes).to.equal(original.notes);
}

export function assertSamePrice(original: Price | PriceDocument, candidate: PriceDocument) {
    expect(candidate).to.exist;
    expect(candidate.price).to.equal(original.price);
    expect(candidate.minWeight).to.equal(original.minWeight);
    expect(candidate.maxWeight).to.equal(original.maxWeight);
    expect(candidate.kind).to.equal(original.kind);
    expect(candidate.extra).to.equal(original.extra);
}

export function assertSameInvoice(original: Invoice | InvoiceDocument, candidate: InvoiceDocument) {
    expect(candidate).to.exist;
    expect(String(candidate.user)).to.equal(String(original.user));
    expect(String(candidate.sender)).to.equal(String(original.sender));
    expect(candidate.number).to.equal('number' in original ? original.number : undefined);
    expect(candidate.taxable).to.equal(original.taxable);
    expect(candidate.iva).to.equal(original.iva);
    expect(candidate.total).to.equal(original.total);
    expect(candidate.paid).to.equal('paid' in original ? original.paid : false);
    expect(candidate.paymentDate).to.equal('paymentDate' in original ? original.paymentDate : undefined);
}

export async function loginWithSystem(): Promise<string> {
    const authService = ioc.resolve(AuthService);
    return (await authService.login({
        usernameOrEmail: "system",
        password: process.env.SYSTEM_PASS
    }));
}

export async function getSystemUser(): Promise<UserDocument> {
    const userService = ioc.resolve(UserService);
    return (await userService.find({
        username: "system"
    }))[0];
}

export async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function importMunicipalities(): Promise<void> {
    await ioc.resolve(MunicipalityService).importFromJSON(await fs.promises.readFile("test/assets/json/municipalities.json"));
}
export async function importPrices(): Promise<void> {
    await PriceModel.insertMany(prices);
}
