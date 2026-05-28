import { MongoRepository } from "@services/MongoRepository";
import {
    Municipality,
    MunicipalityDocument,
    MunicipalityModel,
    MunicipalityHamlet,
    municipalityDecoder,
} from "@models/MunicipalityModel";
import { provide } from "inversify-binding-decorators";
import { Request } from "express";
import { connection } from "mongoose";
import { logger } from "@utils/winston";
import multer, { memoryStorage } from "multer";
import { ImportError } from "@utils/xlsx-uploader";
import * as fs from "fs";
import * as path from "path";

// JSON upload (legacy: usato dall'admin per importare manualmente un comuni-json
// di matteocontrini come sovrascrittura. Lasciato per emergenze. La via principale
// di seeding è ora `ensureSeeded()` chiamato al boot.)
export const jsonUploader = multer({
    storage: memoryStorage(),
    limits: {
        files: 1,
        fileSize: 10 * 1000 * 1000 // 10MB (il municipalities.json fa ~2.4MB)
    },
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
    zona: { codice: string; nome: string }
    regione: { codice: string; nome: string }
    provincia: { codice: string; nome: string }
    sigla: string
    codiceCatastale: string
    cap: Array<string>
}

interface MunicipalitiesMeta {
    sha256: string
    count: number
    sourceCAPGC: string
    builtAt: string
}

// ─── Risultato di /validate ──────────────────────────────────────────────────
//
// Modello esposto al frontend per costruire la UX dei suggerimenti.
//
// Codici errore:
//   MUNI_NOT_FOUND     comune non in DB → suggestions: top-N fuzzy matches
//   ZIP_MISMATCH       CAP non appartiene al comune → suggestions: tutti i CAP del comune
//   PROVINCE_MISMATCH  sigla provincia non coincide con la nostra anagrafica
export type ValidationErrorCode = "MUNI_NOT_FOUND" | "ZIP_MISMATCH" | "PROVINCE_MISMATCH";

export interface AddressValidationInput {
    city: string
    zip: string
    province?: string
}

export interface AddressValidationError {
    code: ValidationErrorCode
    message: string
    expected?: string | string[]
}

export interface AddressValidationResult {
    ok: boolean
    normalized?: {
        city: string
        zip: string
        province: string
        provinceName?: string
        region?: string
        istat?: string
        code?: string
    }
    errors: AddressValidationError[]
    suggestions: Array<{
        city: string
        province: string
        provinceName?: string
        zip: string[]
    }>
}

/**
 * Normalizza un nome di comune per matching/ricerca.
 * Coerente con scripts/build-municipalities.js.
 *  - lowercase
 *  - drop diacritici (NFD + combining marks)
 *  - apostrofi tipografici → ASCII
 *  - whitespace collassato
 *  - apostrofo finale rimosso (Poste vs ISTAT: "Canicatti'" vs "Canicattì")
 */
function normalizeCity(s: string): string {
    if (s == null) return "";
    return String(s)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u2018\u2019\u02BC]/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/'$/, "");
}

/**
 * Escape di un regex literal per essere usato nei filtri Mongo.
 * Senza questo, "Sant'Agata" o "L'Aquila" generano regex invalido.
 */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

@provide(MunicipalityService)
export class MunicipalityService extends MongoRepository<Municipality, MunicipalityDocument> {

    constructor(private municipalityModel = MunicipalityModel) {
        super(municipalityModel, municipalityDecoder, [
            "name", "nameNormalized", "province", "zip", "country", "code", "istat"
        ]);
    }

    // ────────────────────────────────────────────────────────────────────────
    //  Boot-time seeding idempotente.
    //
    //  Logica:
    //    1) leggi il checksum atteso da data/municipalities.meta.json (committato)
    //    2) leggi il documento {_id:"main"} dalla collection "municipalitiesmetas"
    //    3) se il checksum coincide → no-op (skip)
    //    4) altrimenti: drop collection "municipalities" + bulk insert dal JSON
    //       + replace meta col nuovo checksum
    //
    //  Cost: una read sulla collection meta a ogni boot, ~0ms.
    //  Quando rilanciare: dopo aver rigenerato i file `data/municipalities*` con
    //  `node scripts/build-municipalities.js` (es. nuovo CAP_GC semestrale).
    // ────────────────────────────────────────────────────────────────────────

    public async ensureSeeded(): Promise<{ skipped: boolean; count?: number; sha?: string }> {
        const dataPath = MunicipalityService.findDataPath("municipalities.json");
        const metaPath = MunicipalityService.findDataPath("municipalities.meta.json");

        if (!dataPath || !metaPath) {
            logger.warn(
                "[Municipality.seed] data/municipalities.json o .meta.json non trovati. " +
                "Esegui `node scripts/build-municipalities.js` per generarli. Skip seed."
            );
            return { skipped: true };
        }

        const meta: MunicipalitiesMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const expectedSha = meta.sha256;

        const metaCol = connection.collection("municipalitiesmetas");
        const cur = await metaCol.findOne({ _id: "main" } as any);
        if (cur && (cur as any).sha256 === expectedSha) {
            logger.info(`[Municipality.seed] Up-to-date (sha=${expectedSha.slice(0, 12)}…, count=${meta.count}). Skip.`);
            return { skipped: true, count: meta.count, sha: expectedSha };
        }

        logger.info(
            `[Municipality.seed] Reseeding: have=${cur ? (cur as any).sha256?.slice(0, 12) : "none"} ` +
            `→ want=${expectedSha.slice(0, 12)}… (count=${meta.count}, source=${meta.sourceCAPGC})`
        );

        // Carico in RAM solo qui (~12MB parsed). Subito dopo viene rilasciato.
        const records = JSON.parse(fs.readFileSync(dataPath, "utf8")) as Municipality[];

        // Drop e ricrea: più semplice e più sicuro che fare diff.
        // Su 8K documenti l'operazione è praticamente istantanea.
        const colExists = (await connection.db.listCollections({ name: "municipalities" }).toArray()).length > 0;
        if (colExists) {
            await connection.db.dropCollection("municipalities");
        }
        // bulk insert non validato: i decoder li abbiamo già passati allo build-time.
        // Se un giorno il JSON viene corrotto a mano, fallirà l'unique-validator
        // sul campo `istat`.
        await this.municipalityModel.insertMany(records, { ordered: false });
        await this.municipalityModel.ensureIndexes();

        await metaCol.replaceOne(
            { _id: "main" } as any,
            {
                _id: "main",
                sha256: expectedSha,
                count: meta.count,
                sourceCAPGC: meta.sourceCAPGC,
                seededAt: new Date(),
            } as any,
            { upsert: true }
        );

        logger.info(`[Municipality.seed] Seeded ${records.length} comuni from ${meta.sourceCAPGC}`);
        return { skipped: false, count: records.length, sha: expectedSha };
    }

    /**
     * Trova il file `data/<name>` salendo dalla CWD del processo, e in fallback
     * dalla directory del modulo corrente. Lavora sia in dev (ts-node, CWD = repo)
     * sia in container (CWD = /usr/src/app).
     */
    private static findDataPath(name: string): string | null {
        const candidates: string[] = [];
        const visit = (start: string) => {
            let dir = start;
            for (let i = 0; i < 8; i++) {
                candidates.push(path.join(dir, "data", name));
                const parent = path.dirname(dir);
                if (parent === dir) break;
                dir = parent;
            }
        };
        visit(process.cwd());
        visit(__dirname);
        for (const c of candidates) {
            try {
                if (fs.statSync(c).isFile()) return c;
            } catch { /* miss */ }
        }
        return null;
    }

    // ────────────────────────────────────────────────────────────────────────
    //  Endpoint helpers — chiamati dal MunicipalityController.
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Autocomplete su prefisso/substring del nome.
     * Per UX dropdown: case-insensitive, accent-insensitive.
     *
     * Strategia:
     *  1) prima ricerca con $regex su nameNormalized partendo da `^q` (prefisso)
     *  2) se < limit, integra con substring "contains" per essere più tollerante
     *  3) se è passata una sigla, filtra
     *  4) ordina per province, name
     */
    public async searchByName(q: string, opts: { province?: string; limit?: number } = {}): Promise<MunicipalityDocument[]> {
        const limit = Math.min(Math.max(opts.limit || 20, 1), 50);
        const norm = normalizeCity(q || "");
        if (!norm) return [];

        const baseQuery: any = {};
        if (opts.province) baseQuery.province = opts.province.toUpperCase();

        const escaped = escapeRegex(norm);

        // (1) prefisso
        const prefixed = await this.municipalityModel
            .find({ ...baseQuery, nameNormalized: { $regex: `^${escaped}` } })
            .limit(limit)
            .sort({ province: 1, nameNormalized: 1 })
            .exec();

        if (prefixed.length >= limit) return prefixed;

        // (2) integra con substring (escludendo i già trovati)
        const seen = new Set(prefixed.map(x => x._id.toString()));
        const contained = await this.municipalityModel
            .find({
                ...baseQuery,
                nameNormalized: { $regex: escaped },
                _id: { $nin: prefixed.map(x => x._id) }
            })
            .limit(limit - prefixed.length)
            .sort({ province: 1, nameNormalized: 1 })
            .exec();

        return [...prefixed, ...contained.filter(d => !seen.has(d._id.toString()))];
    }

    /**
     * Lookup per CAP esatto. Un singolo CAP può appartenere a più comuni
     * (raro: tipicamente piccoli comuni che condividono CAP). Restituisce
     * tutti i match.
     */
    public async findByZip(zip: string): Promise<MunicipalityDocument[]> {
        const z = (zip || "").trim();
        if (!/^\d{5}$/.test(z)) return [];
        return this.municipalityModel.find({ zip: z }).sort({ province: 1, nameNormalized: 1 }).exec();
    }

    /**
     * Lookup per CAP che cerca anche nelle frazioni. Utile per CAP di frazioni
     * (es. 19030 Bocca di Magra → comune Ameglia, ma il CAP NON è in zip[]
     * del comune principale).
     */
    public async findByZipIncludingHamlets(zip: string): Promise<{
        municipalities: MunicipalityDocument[]
        hamlets: Array<{ municipality: MunicipalityDocument; hamlet: MunicipalityHamlet }>
    }> {
        const z = (zip || "").trim();
        if (!/^\d{5}$/.test(z)) return { municipalities: [], hamlets: [] };
        const [muni, ham] = await Promise.all([
            this.municipalityModel.find({ zip: z }).exec(),
            this.municipalityModel.find({ "hamlets.zip": z }).exec(),
        ]);
        const hamlets: Array<{ municipality: MunicipalityDocument; hamlet: MunicipalityHamlet }> = [];
        for (const m of ham) {
            for (const h of (m.hamlets || [])) {
                if (h.zip === z) hamlets.push({ municipality: m, hamlet: h });
            }
        }
        return { municipalities: muni, hamlets };
    }

    public async findByIstat(istat: string): Promise<MunicipalityDocument | null> {
        const i = (istat || "").trim();
        if (!i) return null;
        return this.municipalityModel.findOne({ istat: i }).exec();
    }

    /**
     * Validazione semantica address-level.
     * È il cuore dell'API: tutti i form pre-submit devono passare di qui.
     */
    public async validateAddress(input: AddressValidationInput): Promise<AddressValidationResult> {
        const errors: AddressValidationError[] = [];
        const suggestions: AddressValidationResult["suggestions"] = [];
        const cityNorm = normalizeCity(input.city);
        const zip = (input.zip || "").trim();
        const province = (input.province || "").trim().toUpperCase();

        if (!cityNorm) {
            errors.push({ code: "MUNI_NOT_FOUND", message: "Comune non specificato." });
            return { ok: false, errors, suggestions };
        }

        // Cerco prima per nome+sigla, poi per nome puro.
        let muni: MunicipalityDocument | null = null;
        if (province) {
            muni = await this.municipalityModel.findOne({
                nameNormalized: cityNorm,
                province
            }).exec();
        }
        if (!muni) {
            muni = await this.municipalityModel.findOne({ nameNormalized: cityNorm }).exec();
        }

        if (!muni) {
            // Fuzzy suggestion: prefisso più ricerca contains.
            const sugg = await this.searchByName(input.city, { limit: 5 });
            for (const s of sugg) {
                suggestions.push({
                    city: s.name,
                    province: s.province,
                    provinceName: s.provinceName,
                    zip: s.zip,
                });
            }
            errors.push({
                code: "MUNI_NOT_FOUND",
                message: `Il comune "${input.city}" non è presente nell'anagrafica Poste.`,
            });
            return { ok: false, errors, suggestions };
        }

        if (province && province !== muni.province) {
            errors.push({
                code: "PROVINCE_MISMATCH",
                message: `La provincia "${province}" non corrisponde a "${muni.name}" (${muni.province}).`,
                expected: muni.province,
            });
        }

        if (!zip || !/^\d{5}$/.test(zip)) {
            errors.push({
                code: "ZIP_MISMATCH",
                message: `Il CAP "${input.zip}" non è valido (atteso 5 cifre).`,
                expected: muni.zip,
            });
        } else if (!muni.zip.includes(zip)) {
            // Controllo se il CAP appartiene a una frazione del comune
            const hamletMatch = (muni.hamlets || []).find(h => h.zip === zip);
            if (!hamletMatch) {
                errors.push({
                    code: "ZIP_MISMATCH",
                    message: `Il CAP ${zip} non è valido per ${muni.name} (${muni.province}).`,
                    expected: muni.zip,
                });
            }
        }

        if (errors.length > 0) {
            suggestions.push({
                city: muni.name,
                province: muni.province,
                provinceName: muni.provinceName,
                zip: muni.zip,
            });
            return { ok: false, errors, suggestions };
        }

        return {
            ok: true,
            errors: [],
            suggestions: [],
            normalized: {
                city: muni.name,
                zip,
                province: muni.province,
                provinceName: muni.provinceName,
                region: muni.region,
                istat: muni.istat,
                code: muni.code,
            },
        };
    }

    // ────────────────────────────────────────────────────────────────────────
    //  Legacy / Admin: import manuale da JSON file (matteocontrini/comuni-json).
    //
    //  Mantenuto come strumento d'emergenza, NON usato in flusso normale.
    //  In flusso normale il seed avviene via `ensureSeeded()` al boot, dal file
    //  `data/municipalities.json` committato.
    //
    //  Differenza: questo endpoint accetta SOLO il formato JSON di matteocontrini
    //  e ignora le frazioni del CAP_GC Poste. Se viene usato in produzione, perde
    //  i CAP plurali dei grandi centri. WARNING in log per chi lo usa.
    // ────────────────────────────────────────────────────────────────────────

    public async importFromJSON(json: Buffer): Promise<number> {
        logger.warn(
            "[Municipality.importFromJSON] Modalità admin/emergenza in uso. " +
            "Importa solo da matteocontrini/comuni-json e PERDE i CAP estesi del CAP_GC Poste. " +
            "Per il seed regolare usa scripts/build-municipalities.js + boot-time ensureSeeded()."
        );

        const parsed = JSON.parse(json.toString()) as Array<JsonMunicipality>;
        const records: Municipality[] = parsed.map(m => {
            const caps = (m.cap || []).filter(z => /^\d{5}$/.test(z)).sort();
            return {
                name: m.nome,
                nameNormalized: normalizeCity(m.nome),
                province: m.sigla,
                provinceName: m.provincia.nome,
                region: m.regione.nome,
                zip: caps,
                zipMain: caps[0],
                isGrandeCentro: caps.length > 1,
                hamlets: [],
                country: "ITALY",
                code: m.codiceCatastale,
                istat: m.codice,
                source: "ISTAT_LEGACY_IMPORT",
            };
        });

        const exists = (await connection.db.listCollections({ name: "municipalities" }).toArray()).length > 0;
        if (exists) await connection.db.dropCollection("municipalities");
        const imported = await this.municipalityModel.insertMany(records);

        // Reset checksum: l'admin import ha scollegato lo stato dal JSON committato,
        // quindi al prossimo boot ensureSeeded() riseederà dal JSON canonico.
        await connection.collection("municipalitiesmetas").deleteOne({ _id: "main" } as any);

        logger.info(`Ok! ${imported.length} municipalities imported (legacy).`);
        return imported.length;
    }

    /**
     * Helper legacy usato da SenderService/RecipientService nei bulk-import XLSX.
     * Mantenuto per retrocompatibilità — i nuovi flussi devono usare validateAddress().
     */
    public async assertMunicipalityExists(city: string, zip: string, row: number, errors: Array<ImportError>): Promise<MunicipalityDocument> {
        const cityNorm = normalizeCity(city);
        if (!cityNorm) {
            errors.push({
                row: row + 2,
                description: `Nome comune vuoto.`,
            });
            return null;
        }

        let municipality: MunicipalityDocument = null;
        try {
            municipality = await this.findOne({ nameNormalized: cityNorm } as object);
        } catch (err) {
            if (err.status !== 404) logger.error(`Got an error while querying for the municipality on row ${row + 2}! ${err}`);
            errors.push({
                row: row + 2,
                description: err.status === 404 ?
                    `Non è stato trovato alcun comune di nome '${city}'. Potrebbe essere necessario richiedere l'inserimento di questo comune nel sistema tramite l'apposito modulo.` :
                    `Errore durante la ricerca del comune di nome '${city}' nel database.`,
                data: err.status === 404 ? undefined : (err.message || err)
            });
            return null;
        }

        const zipTrim = (zip || "").trim();
        const inMain = municipality.zip.includes(zipTrim);
        const inHamlet = (municipality.hamlets || []).some(h => h.zip === zipTrim);
        if (!inMain && !inHamlet) {
            errors.push({
                row: row + 2,
                description: `Il CAP ${zipTrim} per ${city} non corrisponde ad alcun CAP registrato per questo comune.`
            });
            return null;
        }

        return municipality;
    }

}
