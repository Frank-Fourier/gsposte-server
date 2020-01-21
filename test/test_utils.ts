import { UserDocument } from "@models/UserModel";
import { expect } from "chai";
import { ioc } from "@ioc";
import { AuthService } from "@services/AuthService";
import { UserService } from "@services/UserService";
import { Sender, SenderDocument } from "@models/SenderModel";
import { Recipient, RecipientDocument } from "@models/RecipientModel";

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
    expect(candidate.address).to.equal(original.address);
    expect(candidate.city).to.equal(original.city);
    expect(candidate.iva).to.equal(original.iva);
    expect(candidate.cf).to.equal(original.cf);
    expect(candidate.email).to.equal(original.email.trim().toLowerCase());
    expect(candidate.notes).to.equal(original.notes);
}

export function assertSameRecipient(original: Recipient | RecipientDocument, candidate: RecipientDocument) {
    expect(candidate).to.exist;
    expect(candidate.user.toString()).to.equal(original.user.toString());
    expect(candidate.address).to.equal(original.address);
    expect(candidate.secondaryAddress).to.equal(original.secondaryAddress);
    expect(candidate.city).to.equal(original.city);
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
