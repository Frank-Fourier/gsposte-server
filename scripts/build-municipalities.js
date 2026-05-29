#!/usr/bin/env node
/* eslint-disable */
//
// build-municipalities.js
// ─────────────────────────────────────────────────────────────────────────────
// Costruisce data/municipalities.json fondendo:
//   1) data/source/CAP_GC_I_Sem<YEAR>.xlsx
//      → fonte autorevole Poste Italiane per i CAP di recapito
//      → fogli: PROVINCIA, COMUNE (CAP × Comune × Sigla), FRAZIONE
//      → fa fede sui CAP perché ValidaDestinatari di Poste H2H
//        accetta SOLO CAP che esistono in questo dataset (o equivalente
//        più recente). Va aggiornato 2 volte l'anno (I e II semestre).
//
//   2) data/source/comuni-json.json
//      → matteocontrini/comuni-json (license MIT, dati ISTAT)
//      → arricchisce con: regione, codice ISTAT comune, codice catastale
//      → NON è autoritativo sui CAP (ne ha solo 1 per comune, geografico).
//
// Output:
//   - data/municipalities.json     ← committato in repo, letto al boot
//   - data/municipalities.meta.json ← {sha256, count, sourceCAPGC, builtAt}
//
// Esecuzione:
//   $ node scripts/build-municipalities.js
//
// Quando rilanciare:
//   - quando Poste pubblica un nuovo CAP_GC_*.xlsx (~ogni 6 mesi);
//     basta sostituire il file in data/source/ e rilanciare.
//   - quando matteocontrini/comuni-json pubblica una nuova release
//     (es. fusioni/soppressioni comuni); rifare:
//       curl -sSL -o data/source/comuni-json.json \
//         https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json
//
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const xlsx = require("xlsx");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "data", "source");
const OUT_DIR = path.join(ROOT, "data");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalizza un nome di comune/frazione/provincia per matching cross-source.
 * - lowercase
 * - rimuove diacritici (NFD + drop combining marks)
 * - rimpiazza apostrofi tipografici con quello ASCII
 * - collassa whitespace
 * - trim
 *
 * Note: NON rimuoviamo apostrofi né trattini perché i nomi ufficiali ISTAT
 * li mantengono (es. "Sant'Agata", "Reggio nell'Emilia", "Ascoli-Piceno"
 * non esiste ma "Reggio nell'Emilia" sì).
 */
function normalize(s) {
    if (s == null) return "";
    return String(s)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u2018\u2019\u02BC]/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/**
 * Normalizzazione "loose" che gestisce le quirks tipografiche di Poste:
 *  - apostrofo finale dopo vocale (Poste scrive "Canicatti'" mentre ISTAT
 *    scrive "Canicattì") → eliminato
 *  - "/" e "-" trattati come spazio per matching tollerante
 *
 * Si usa SOLO come fallback dopo il match esatto, per evitare collisioni
 * tra omonimi.
 */
function normalizeLoose(s) {
    if (s == null) return "";
    let n = normalize(s);
    n = n.replace(/'/g, "");
    n = n.replace(/[-/]/g, " ").replace(/\s+/g, " ").trim();
    return n;
}

/**
 * Title-case "ROMA" → "Roma", "REGGIO NELL'EMILIA" → "Reggio Nell'Emilia".
 * Lasciamo il dataset in formato omogeneo Title Case ASCII (no MAIUSCOLE Poste,
 * no minuscole). Così il display nel frontend è già pronto.
 */
function titleCase(s) {
    if (!s) return s;
    return String(s)
        .toLowerCase()
        .replace(/(^|[\s'\-/])([a-zàèéìòù])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function sha256(buf) {
    return crypto.createHash("sha256").update(buf).digest("hex");
}

function loadJson(p) {
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

function existsOrDie(p, hint) {
    if (!fs.existsSync(p)) {
        console.error(`ERROR: file mancante: ${p}\n  ${hint || ""}`);
        process.exit(1);
    }
}

// ─── Step 1: leggi xlsx Poste ────────────────────────────────────────────────

function readPosteXlsx() {
    // Cerca un file CAP_GC_*.xlsx nel source dir; in genere ce n'è uno solo.
    const files = fs
        .readdirSync(SRC_DIR)
        .filter((f) => /^CAP_GC_.+\.xlsx$/i.test(f))
        .sort();
    if (files.length === 0) {
        console.error(`ERROR: nessun CAP_GC_*.xlsx in ${SRC_DIR}`);
        console.error(`  Scarica il file ufficiale Poste e mettilo lì.`);
        process.exit(1);
    }
    if (files.length > 1) {
        console.warn(`WARN: multipli CAP_GC_*.xlsx, uso il più recente: ${files[files.length - 1]}`);
    }
    const file = files[files.length - 1];
    const fpath = path.join(SRC_DIR, file);
    console.log(`[1/5] Leggo Poste xlsx: ${file}`);

    const wb = xlsx.readFile(fpath);
    const need = ["PROVINCIA", "COMUNE", "FRAZIONE"];
    for (const sn of need) {
        if (!wb.SheetNames.includes(sn)) {
            console.error(`ERROR: foglio "${sn}" mancante in ${file}.`);
            console.error(`  Fogli trovati: ${wb.SheetNames.join(", ")}`);
            process.exit(1);
        }
    }

    const sheetProvinces = xlsx.utils.sheet_to_json(wb.Sheets["PROVINCIA"], { raw: false });
    const sheetComuni = xlsx.utils.sheet_to_json(wb.Sheets["COMUNE"], { raw: false });
    const sheetFrazioni = xlsx.utils.sheet_to_json(wb.Sheets["FRAZIONE"], { raw: false });

    return {
        file,
        path: fpath,
        provinces: sheetProvinces, // [{SiglaProvincia, Provincia}]
        comuni: sheetComuni,       // [{CAP, COMUNE, SiglaProvincia}]
        frazioni: sheetFrazioni,   // [{CAP, COMUNE, FRAZIONE, PROVINCIA}]
    };
}

// ─── Step 2: leggi matteocontrini/comuni-json ────────────────────────────────

function readComuniJson() {
    const fpath = path.join(SRC_DIR, "comuni-json.json");
    existsOrDie(
        fpath,
        "Esegui:  curl -sSL -o data/source/comuni-json.json https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json"
    );
    console.log(`[2/5] Leggo comuni-json (ISTAT/codice catastale/regione)`);
    return loadJson(fpath);
}

// ─── Step 3: merge ───────────────────────────────────────────────────────────

function buildMunicipalities(poste, comuniJson) {
    console.log(`[3/5] Merging dataset...`);

    // 3a) Lookup sigla provincia → nome provincia (autoritativo Poste)
    //
    // Anche se sembra ridondante con comuni-json, Poste può avere righe
    // con sigla "MI" che corrisponde a "MILANO" anche per i comuni della
    // città metropolitana. Lo teniamo per visualizzazione "Provincia" full.
    const provNameBySigla = new Map();
    for (const r of poste.provinces) {
        const sig = (r.SiglaProvincia || "").trim().toUpperCase();
        const nm = (r.Provincia || "").trim();
        if (sig && nm) provNameBySigla.set(sig, titleCase(nm));
    }

    // 3b) Lookup nome comune normalizzato → record comuni-json
    //     Costruiamo più mappe per matching a cascata:
    //       (1) nome+sigla esatto         → "roma|RM"
    //       (2) nome esatto               → "roma"
    //       (3) nome loose+sigla          → "canicatti|AG"        (Poste "Canicatti'" → ISTAT "Canicattì")
    //       (4) nome loose                → "canicatti"
    //
    //     L'ordine di priorità è (1) > (2) > (3) > (4). La chiave con sigla
    //     vince per disambiguare omonimi raristi (fusioni con cambio prov.).
    const comuniByName = new Map();
    const comuniByNameSig = new Map();
    const comuniByLoose = new Map();
    const comuniByLooseSig = new Map();
    for (const c of comuniJson) {
        const k = normalize(c.nome);
        const kl = normalizeLoose(c.nome);
        const sig = (c.sigla || "").toUpperCase();
        if (!comuniByName.has(k)) comuniByName.set(k, c);
        comuniByNameSig.set(`${k}|${sig}`, c);
        if (!comuniByLoose.has(kl)) comuniByLoose.set(kl, c);
        comuniByLooseSig.set(`${kl}|${sig}`, c);
    }

    // 3c) Aggrega CAP per (nome,sigla) dal foglio COMUNE Poste.
    //     Il foglio Poste ha 1 riga per CAP → un grande centro come Roma
    //     compare con N righe (Roma 00100, 00118, 00119, ...).
    //     Aggreghiamo in `caps[]` ordinato.
    const aggKey = (name, sig) => `${normalize(name)}|${(sig || "").toUpperCase()}`;
    /** @type {Map<string, {nameRaw: string, sigla: string, caps: Set<string>}>} */
    const muniAgg = new Map();
    for (const r of poste.comuni) {
        const cap = (r.CAP || "").trim();
        const name = (r.COMUNE || "").trim();
        const sig = (r.SiglaProvincia || "").trim().toUpperCase();
        if (!cap || !name || !sig) continue;
        if (!/^\d{5}$/.test(cap)) continue;
        const key = aggKey(name, sig);
        let entry = muniAgg.get(key);
        if (!entry) {
            entry = { nameRaw: name, sigla: sig, caps: new Set() };
            muniAgg.set(key, entry);
        }
        entry.caps.add(cap);
    }

    // 3d) Aggrega frazioni per (nome,sigla) dal foglio FRAZIONE Poste.
    /** @type {Map<string, Array<{name: string, zip: string}>>} */
    const frazAgg = new Map();
    for (const r of poste.frazioni) {
        const cap = (r.CAP || "").trim();
        const com = (r.COMUNE || "").trim();
        const sig = (r.PROVINCIA || "").trim().toUpperCase(); // colonna è "PROVINCIA" (sigla)
        const fra = (r.FRAZIONE || "").trim();
        if (!cap || !com || !sig || !fra) continue;
        if (!/^\d{5}$/.test(cap)) continue;
        const key = aggKey(com, sig);
        let arr = frazAgg.get(key);
        if (!arr) {
            arr = [];
            frazAgg.set(key, arr);
        }
        arr.push({ name: titleCase(fra), zip: cap });
    }

    // 3e) Costruzione finale del dataset.
    //
    //     Una città è "grande centro" se ha più di 1 CAP nel foglio COMUNE
    //     Poste — euristica accettata da industria (Roma, Milano, Torino,
    //     Napoli, Genova, Bologna, Firenze, Palermo, ecc).
    //
    //     `region` viene da comuni-json se trovato; altrimenti rimane vuoto
    //     (rara per comuni recenti non ancora in matteocontrini/comuni-json).
    const out = [];
    let unmatched = 0;
    for (const [key, agg] of muniAgg.entries()) {
        const ne = normalize(agg.nameRaw);
        const nl = normalizeLoose(agg.nameRaw);
        // Match a cascata. I fallback "solo nome" (senza sigla) sono ammessi
        // SOLO se la provincia del comune ISTAT combacia con quella Poste:
        // altrimenti un omonimo in un'altra provincia (es. Corvara PE) verrebbe
        // assegnato per errore a Corvara (BZ), con istat/regione sbagliati e un
        // duplicato sull'indice unique{istat}.
        let cj =
            comuniByNameSig.get(`${ne}|${agg.sigla}`) ||
            comuniByLooseSig.get(`${nl}|${agg.sigla}`);
        if (!cj) {
            const cand = comuniByName.get(ne) || comuniByLoose.get(nl);
            if (cand && (cand.sigla || "").toUpperCase() === agg.sigla) cj = cand;
        }
        if (!cj) {
            unmatched++;
            // Lo includiamo lo stesso: il nostro source-of-truth è Poste.
            // Niente regione/istat/codice catastale → frontend mostrerà
            // solo i campi Poste.
        }
        const caps = Array.from(agg.caps).sort();
        const hamlets = (frazAgg.get(key) || []).sort((a, b) => a.name.localeCompare(b.name));
        const displayName = titleCase(agg.nameRaw);
        const provinceFull = provNameBySigla.get(agg.sigla) || (cj ? cj.provincia.nome : agg.sigla);
        out.push({
            name: displayName,
            nameNormalized: normalize(agg.nameRaw),
            province: agg.sigla,
            provinceName: provinceFull,
            region: cj ? cj.regione.nome : "",
            zip: caps,
            zipMain: caps[0], // prima CAP in ordine numerico = generico
            isGrandeCentro: caps.length > 1,
            hamlets: hamlets,
            country: "ITALY",
            code: cj ? cj.codiceCatastale : undefined,
            istat: cj ? cj.codice : undefined,
            source: cj ? "POSTE_GC+ISTAT" : "POSTE_GC",
        });
    }

    // 3f) Dedup per codice ISTAT. Poste a volte scrive lo stesso comune con due
    //     grafie (es. "Trentola Ducenta" e "Trentola-Ducenta"): generano due
    //     aggregati distinti che però matchano lo stesso comune ISTAT. L'indice
    //     unique{istat} li rifiuterebbe in fase di seed, quindi qui li fondiamo
    //     in un solo record (unione di CAP e frazioni). I record senza istat
    //     (source POSTE_GC) restano intatti.
    const byIstat = new Map();
    const deduped = [];
    let merged = 0;
    for (const rec of out) {
        if (!rec.istat) {
            deduped.push(rec);
            continue;
        }
        const ex = byIstat.get(rec.istat);
        if (!ex) {
            byIstat.set(rec.istat, rec);
            deduped.push(rec);
            continue;
        }
        const caps = Array.from(new Set([ ...ex.zip, ...rec.zip ])).sort();
        ex.zip = caps;
        ex.zipMain = caps[0];
        ex.isGrandeCentro = caps.length > 1;
        const seen = new Set(ex.hamlets.map((h) => `${h.name}|${h.zip}`));
        for (const h of rec.hamlets) {
            const k = `${h.name}|${h.zip}`;
            if (!seen.has(k)) {
                ex.hamlets.push(h);
                seen.add(k);
            }
        }
        ex.hamlets.sort((a, b) => a.name.localeCompare(b.name));
        // Preferiamo la grafia col trattino (canonica ISTAT) per il display.
        if (rec.name.includes("-") && !ex.name.includes("-")) {
            ex.name = rec.name;
            ex.nameNormalized = rec.nameNormalized;
        }
        merged++;
    }

    // Ordine deterministico per stabilità del checksum nei diff git.
    deduped.sort((a, b) => {
        if (a.province !== b.province) return a.province.localeCompare(b.province);
        return a.nameNormalized.localeCompare(b.nameNormalized);
    });

    console.log(
        `       comuni: ${deduped.length}  •  con-istat: ${deduped.filter((m) => m.istat).length}` +
        `  •  senza-istat: ${deduped.filter((m) => !m.istat).length}  •  fusi-per-istat: ${merged}`
    );
    return deduped;
}

// ─── Step 4: write output ────────────────────────────────────────────────────

function writeOutput(records, posteFile) {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const json = JSON.stringify(records, null, 0); // NO whitespace → ridotto, diff più stabili
    const sha = sha256(json);

    const outPath = path.join(OUT_DIR, "municipalities.json");
    const metaPath = path.join(OUT_DIR, "municipalities.meta.json");

    fs.writeFileSync(outPath, json + "\n");
    fs.writeFileSync(
        metaPath,
        JSON.stringify(
            {
                sha256: sha,
                count: records.length,
                sourceCAPGC: posteFile,
                builtAt: new Date().toISOString(),
            },
            null,
            2
        ) + "\n"
    );

    console.log(`[4/5] Scritto: ${path.relative(ROOT, outPath)}  (${(json.length / 1024).toFixed(0)} KB)`);
    console.log(`[5/5] Checksum: sha256:${sha.slice(0, 16)}…`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

(function main() {
    const poste = readPosteXlsx();
    const comuniJson = readComuniJson();
    const records = buildMunicipalities(poste, comuniJson);
    writeOutput(records, poste.file);
    console.log("DONE.");
})();
