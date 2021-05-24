import { MongoRepository } from "@services/MongoRepository";
import { Municipality, MunicipalityDocument, MunicipalityModel, municipalityDecoder } from "@models/MunicipalityModel";
import { provide } from "inversify-binding-decorators";
import { Request } from "express";
import { connection } from "mongoose";
import { logger } from "@utils/winston";
import multer, { memoryStorage } from "multer";

// Setup JSON upload middleware
export const jsonUploader = multer({
    storage: memoryStorage(),
    limits: {
        files: 1,
        fileSize: 5 * 1000 * 1000 // ~5MB
    },
    // The file filter will only accept JSON files
    fileFilter(req: Request, file: Express.Multer.File, callback: (error: (Error | null), acceptFile: boolean) => void): void {
        if (file.mimetype !== "application/json") {
            return callback(null, false);
        }
        callback(null, true);
    }
}).single("file");

interface JsonMunicipality {
    nome: string
    codice: string // ISTAT
    zona: {
        codice: string
        nome: string
    },
    regione: {
        codice: string
        nome: string
    }
    provincia: {
        codice: string
        nome: string
    }
    sigla: string
    codiceCatastale: string
    cap: Array<string>
}

@provide(MunicipalityService)
export class MunicipalityService extends MongoRepository<Municipality, MunicipalityDocument> {

    constructor(private municipalityModel = MunicipalityModel) {
        super(municipalityModel, municipalityDecoder, [
            "name", "province", "zip", "country", "code"
        ]);
    }

    /**
     * Import municipalities from JSON file imported from
     * https://github.com/matteocontrini/comuni-json
     *
     * @param json {Buffer} The whole JSON file as a Buffer object
     * @returns {Promise<number>} resolves to number of municipalities imported
     */
    public async importFromJSON(json: Buffer): Promise<number> {
        logger.info("Requested a municipality import.");

        // Get all municipalities to import
        const municipalities = (JSON.parse(json.toString()) as Array<JsonMunicipality>).map<Municipality>(m => {
            return {
                name: m.nome,
                province: m.sigla,
                region: m.regione.nome,
                zip: m.cap,
                country: "ITALY",
                code: m.codiceCatastale,
                istat: m.codice,
            }
        });

        // Insert all municipalities after drop
        const exists = await (await connection.db.listCollections().toArray()).findIndex((item) => item.name === "municipalities") !== -1;
        if (exists) { await connection.db.dropCollection("municipalities"); }
        const imported = await this.municipalityModel.insertMany(municipalities);

        logger.info(`Ok! ${imported.length} municipalities imported.`);
        return imported.length;
    }

}
