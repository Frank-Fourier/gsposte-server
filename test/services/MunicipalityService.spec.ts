import { suite, test } from "mocha-typescript";
import { expect } from "chai";
import { ioc } from "@ioc";
import { MunicipalityService } from "@services/MunicipalityService";
import { importMunicipalities } from "../test_utils";

/**
 * Test unitari su MunicipalityService.
 *
 * Le asserzioni qui sono volutamente *strutturali* (forma del result, codici
 * d'errore) e non si appoggiano a count puntuali, perché il dataset di test
 * (`test/assets/json/municipalities.json`) è una versione legacy ridotta della
 * comuni-json di matteocontrini, non il dataset completo di produzione.
 *
 * Cosa NON testiamo qui (e perché):
 *  - `ensureSeeded()`: dipende dai file `data/municipalities.{json,meta.json}`
 *    che vengono generati dallo script di build e non commessi in test/assets.
 *    È più efficacemente coperto da un'integration test in CI con il dataset
 *    reale.
 *  - `findByZipIncludingHamlets()` con frazioni: il dataset legacy non ha le
 *    frazioni del CAP_GC Poste; verifichiamo solo il path "no hamlet".
 */
@suite("MunicipalityService") class MunicipalityServiceTests {

    municipalityService = ioc.resolve(MunicipalityService);

    static async before() {
        await importMunicipalities();
    }

    // ────────────────────────────────────────────────────────────────────
    //  searchByName
    // ────────────────────────────────────────────────────────────────────

    @test async "searchByName returns prefix matches case/accent insensitive" () {
        const docs = await this.municipalityService.searchByName("MILA", { limit: 5 });
        expect(docs).to.be.an("array");
        expect(docs.length).to.be.greaterThan(0);
        expect(docs[0].nameNormalized.startsWith("mila")).to.equal(true);
    }

    @test async "searchByName respects province filter" () {
        const docs = await this.municipalityService.searchByName("Roma", { province: "RM", limit: 10 });
        for (const d of docs) {
            expect(d.province).to.equal("RM");
        }
    }

    @test async "searchByName returns [] for empty query" () {
        const docs = await this.municipalityService.searchByName("", { limit: 5 });
        expect(docs).to.eql([]);
    }

    // ────────────────────────────────────────────────────────────────────
    //  findByZip
    // ────────────────────────────────────────────────────────────────────

    @test async "findByZip rejects malformed zips" () {
        expect(await this.municipalityService.findByZip("")).to.eql([]);
        expect(await this.municipalityService.findByZip("12")).to.eql([]);
        expect(await this.municipalityService.findByZip("1234A")).to.eql([]);
    }

    // ────────────────────────────────────────────────────────────────────
    //  validateAddress
    // ────────────────────────────────────────────────────────────────────

    @test async "validateAddress fails on empty city" () {
        const r = await this.municipalityService.validateAddress({
            city: "",
            zip: "00100",
            province: "RM"
        });
        expect(r.ok).to.equal(false);
        expect(r.errors).to.have.length.greaterThan(0);
        expect(r.errors[0].code).to.equal("MUNI_NOT_FOUND");
    }

    @test async "validateAddress returns suggestions when city is unknown" () {
        const r = await this.municipalityService.validateAddress({
            city: "ZZZZNotARealComune",
            zip: "00100",
            province: "XX"
        });
        expect(r.ok).to.equal(false);
        expect(r.errors[0].code).to.equal("MUNI_NOT_FOUND");
        // Non possiamo predire suggerimenti utili su una stringa random,
        // ma la struttura deve esserci.
        expect(r.suggestions).to.be.an("array");
    }

    @test async "validateAddress flags ZIP_MISMATCH on bad CAP for known city" () {
        // Trova un comune con un CAP fissato dal dataset, poi chiede validate
        // con un CAP volutamente sbagliato.
        const milano = await this.municipalityService.searchByName("Milano", { limit: 1 });
        if (!milano.length) return; // dataset di test minimale: skip silenzioso
        const wrongZip = "99999";
        const r = await this.municipalityService.validateAddress({
            city: milano[0].name,
            zip: wrongZip,
            province: milano[0].province,
        });
        expect(r.ok).to.equal(false);
        const codes = r.errors.map(e => e.code);
        expect(codes).to.include("ZIP_MISMATCH");
    }

    @test async "validateAddress flags PROVINCE_MISMATCH" () {
        const milano = await this.municipalityService.searchByName("Milano", { limit: 1 });
        if (!milano.length) return;
        const r = await this.municipalityService.validateAddress({
            city: milano[0].name,
            zip: milano[0].zip[0],
            province: "ZZ", // volutamente errata
        });
        expect(r.ok).to.equal(false);
        const codes = r.errors.map(e => e.code);
        expect(codes).to.include("PROVINCE_MISMATCH");
    }

    @test async "validateAddress returns ok and normalized output for valid input" () {
        const milano = await this.municipalityService.searchByName("Milano", { limit: 1 });
        if (!milano.length) return;
        const r = await this.municipalityService.validateAddress({
            city: milano[0].name,
            zip: milano[0].zip[0],
            province: milano[0].province,
        });
        expect(r.ok).to.equal(true);
        expect(r.errors).to.eql([]);
        expect(r.normalized).to.exist;
        expect(r.normalized.city).to.equal(milano[0].name);
        expect(r.normalized.province).to.equal(milano[0].province);
        expect(r.normalized.zip).to.equal(milano[0].zip[0]);
    }

    @test async "validateAddress is accent/case insensitive on city" () {
        const milano = await this.municipalityService.searchByName("Milano", { limit: 1 });
        if (!milano.length) return;
        const r = await this.municipalityService.validateAddress({
            city: "miLAno", // case alterato
            zip: milano[0].zip[0],
            province: milano[0].province,
        });
        expect(r.ok).to.equal(true);
        expect(r.normalized.city).to.equal(milano[0].name);
    }
}
