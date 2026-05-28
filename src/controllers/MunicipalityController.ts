import { CrudController } from "@controllers/CrudController";
import { inject } from "inversify";
import { AddressValidationInput, MunicipalityService } from "@services/MunicipalityService";
import { Request, Response } from "express";
import httpErrors from "http-errors";

export class MunicipalityController extends CrudController {

    constructor(@inject(MunicipalityService) private municipalityService: MunicipalityService) {
        super(municipalityService, false, true);
    }

    public async importFromJson(req: Request, res: Response) {
        await this.authService.adminOnly(req);

        const numImports = await this.municipalityService.importFromJSON(req.file.buffer);

        return res.status(201).send({
            message: `${numImports} municipalities have been imported!`,
            imported: numImports,
        });
    }

    /**
     * GET /municipality/search?q=mil&province=MI&limit=10
     * Autocomplete per dropdown del frontend.
     */
    public async search(req: Request, res: Response) {
        const q = (req.query.q as string) || "";
        if (!q || q.trim().length < 1) {
            throw new httpErrors.BadRequest("Parametro 'q' obbligatorio.");
        }
        const province = (req.query.province as string) || undefined;
        const limit = parseInt((req.query.limit as string) || "20", 10);

        const docs = await this.municipalityService.searchByName(q, { province, limit });
        return res.send(docs);
    }

    /**
     * GET /municipality/by-zip/:zip
     * Lookup esatto per CAP. Include match nelle frazioni.
     * Risposta: { municipalities: Municipality[], hamlets: { municipality, hamlet }[] }
     */
    public async findByZip(req: Request, res: Response) {
        const zip = (req.params.zip || "").trim();
        if (!/^\d{5}$/.test(zip)) {
            throw new httpErrors.BadRequest("CAP non valido (atteso 5 cifre).");
        }
        const r = await this.municipalityService.findByZipIncludingHamlets(zip);
        return res.send(r);
    }

    /**
     * GET /municipality/by-istat/:istat
     * Lookup per codice ISTAT (chiave logica del comune nel sistema italiano).
     */
    public async findByIstat(req: Request, res: Response) {
        const istat = (req.params.istat || "").trim();
        if (!istat) throw new httpErrors.BadRequest("ISTAT mancante.");
        const m = await this.municipalityService.findByIstat(istat);
        if (!m) throw new httpErrors.NotFound(`Comune con ISTAT '${istat}' non trovato.`);
        return res.send(m);
    }

    /**
     * POST /municipality/validate
     * Body: { city, zip, province? }
     * Restituisce un oggetto con { ok, normalized?, errors[], suggestions[] }.
     * Lo chiamano i form di create/edit (sender, recipient, letter wizard) prima del submit.
     */
    public async validate(req: Request, res: Response) {
        const body = req.body || {};
        const input: AddressValidationInput = {
            city: typeof body.city === "string" ? body.city : "",
            zip: typeof body.zip === "string" ? body.zip : "",
            province: typeof body.province === "string" ? body.province : undefined,
        };
        if (!input.city && !input.zip) {
            throw new httpErrors.BadRequest("city o zip obbligatori nel body.");
        }
        const result = await this.municipalityService.validateAddress(input);
        return res.send(result);
    }

}
