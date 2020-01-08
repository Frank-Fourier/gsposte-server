import { UserDocument } from "@models/UserModel";
import { expect } from "chai";

export function assertSameUser(original: UserDocument, candidate: UserDocument) {
    expect(candidate).to.exist;
    expect(candidate.username).to.equal(original.username);
    expect(candidate.email).to.equal(original.email);
    expect(candidate.password).to.equal(original.password);
    expect(candidate._id.toString()).to.equal(original._id.toString());
}
