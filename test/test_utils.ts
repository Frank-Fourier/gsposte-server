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
    expect(candidate.density).to.equal(original.density);
    expect(candidate.notes).to.equal(original.notes);
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
