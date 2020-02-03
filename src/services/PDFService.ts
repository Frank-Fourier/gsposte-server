import { provide } from "inversify-binding-decorators";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

@provide(PDFService)
export class PDFService {

    public async toBase64(pdf_path: string): Promise<string> {
        if (pdf_path.startsWith("http")) {
            // The argument is an URL. Fetch it and convert
            const res = await fetch(pdf_path);
            return Buffer.from(await res.arrayBuffer()).toString("base64");
        }

        // The argument is not an URL, which means it's a path
        return Buffer.from(await fs.promises.readFile(path.resolve(pdf_path))).toString("base64");
    }

}
