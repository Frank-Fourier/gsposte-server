#!/usr/bin/env node
/* eslint-disable */
//
// normalize-addresses.js
// ─────────────────────────────────────────────────────────────────────────────
// Script ONE-SHOT di normalizzazione delle anagrafiche già a sistema (Sender,
// Recipient) contro la nuova collection `municipalities` seedata da
// build-municipalities.js.
//
// Cosa fa, per ogni indirizzo (`address`, `addressAR`, `addressBill`):
//   1) cerca il comune per (city, province) → fallback su city solo;
//   2) se trovato e CAP coerente: opzionalmente normalizza city/province
//      con la grafia ufficiale (es. "milano" → "Milano");
//   3) se non trovato o CAP incoerente: mette la riga nel report CSV.
//
// L'output è SOLO un report CSV; la modalità DRY-RUN è di default ed è
// l'unica che gira finché non si passa --apply esplicito.
//
// Uso:
//   $ MONGO_URI=mongodb://localhost:27017/gsposte_dev node scripts/normalize-addresses.js
//   (dry-run, scrive solo report)
//
//   $ MONGO_URI=... node scripts/normalize-addresses.js --apply
//   (applica le normalizzazioni e scrive il report)
//
// Output:
//   data/normalize-addresses-report-<timestamp>.csv
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const ROOT = path.resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");

const MONGO_URI = process.env.MONGO_URI || (() => {
    // dotenv-flow style: prova a leggere variabili da .env / .env.development
    require("dotenv-flow").config({ silent: true });
    const host = process.env.MONGO_HOST || "localhost";
    const port = process.env.MONGO_PORT || "27017";
    const name = process.env.MONGO_NAME || "gsposte_dev";
    return `mongodb://${host}:${port}/${name}`;
})();

function normalizeCity(s) {
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

function csvEscape(v) {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

(async function main() {
    console.log(`[normalize-addresses] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
    console.log(`[normalize-addresses] mongo=${MONGO_URI.replace(/(:\/\/)([^@]+)@/, "$1***@")}`);

    await mongoose.connect(MONGO_URI, {
        useNewUrlParser: true,
        useCreateIndex: true,
        useFindAndModify: false,
        useUnifiedTopology: true,
    });

    const db = mongoose.connection;

    const senders = db.collection("senders");
    const recipients = db.collection("recipients");
    const municipalities = db.collection("municipalities");

    const totalMuni = await municipalities.countDocuments();
    if (totalMuni === 0) {
        console.error(
            "[normalize-addresses] La collection municipalities è vuota. " +
            "Lancia prima il server una volta (auto-seed) o esegui build-municipalities.js + import."
        );
        process.exit(1);
    }
    console.log(`[normalize-addresses] municipalities=${totalMuni}`);

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(ROOT, "data", `normalize-addresses-report-${ts}.csv`);
    const report = fs.createWriteStream(reportPath, { encoding: "utf8" });
    report.write("collection,id,addressKey,city,zip,province,problem,suggestion\n");

    let problems = 0;
    let normalized = 0;

    async function lookupBest(city, province) {
        const cityNorm = normalizeCity(city || "");
        if (!cityNorm) return null;
        const q = { nameNormalized: cityNorm };
        if (province) q.province = String(province).toUpperCase();
        let m = await municipalities.findOne(q);
        if (!m && province) m = await municipalities.findOne({ nameNormalized: cityNorm });
        return m;
    }

    async function processCollection(col, collectionName, addressKeys) {
        const cur = col.find({}, { projection: { _id: 1, address: 1, addressAR: 1, addressBill: 1 } });
        while (await cur.hasNext()) {
            const doc = await cur.next();
            const updates = {};
            for (const k of addressKeys) {
                const a = doc[k];
                if (!a || (!a.city && !a.zip)) continue;

                const m = await lookupBest(a.city, a.province);
                if (!m) {
                    problems++;
                    report.write([
                        collectionName,
                        doc._id,
                        k,
                        a.city,
                        a.zip,
                        a.province,
                        "MUNI_NOT_FOUND",
                        ""
                    ].map(csvEscape).join(",") + "\n");
                    continue;
                }
                const zipOk = (m.zip || []).includes(a.zip)
                    || (m.hamlets || []).some(h => h.zip === a.zip);
                if (!zipOk) {
                    problems++;
                    report.write([
                        collectionName,
                        doc._id,
                        k,
                        a.city,
                        a.zip,
                        a.province,
                        "ZIP_MISMATCH",
                        `valid_zips=[${(m.zip || []).join("|")}]`
                    ].map(csvEscape).join(",") + "\n");
                    continue;
                }
                if (a.city !== m.name || a.province !== m.province) {
                    normalized++;
                    if (APPLY) {
                        updates[`${k}.city`] = m.name;
                        updates[`${k}.province`] = m.province;
                        if (!a.country) updates[`${k}.country`] = m.country || "ITALY";
                    } else {
                        report.write([
                            collectionName,
                            doc._id,
                            k,
                            a.city,
                            a.zip,
                            a.province,
                            "WOULD_NORMALIZE",
                            `→ ${m.name} (${m.province})`
                        ].map(csvEscape).join(",") + "\n");
                    }
                }
            }
            if (APPLY && Object.keys(updates).length > 0) {
                await col.updateOne({ _id: doc._id }, { $set: updates });
            }
        }
    }

    console.log("[normalize-addresses] processing senders...");
    await processCollection(senders, "senders", ["address", "addressAR", "addressBill"]);

    console.log("[normalize-addresses] processing recipients...");
    await processCollection(recipients, "recipients", ["address"]);

    report.end();
    console.log(
        `[normalize-addresses] done. problems=${problems} normalized${APPLY ? "" : "(would)"}=${normalized}`
    );
    console.log(`[normalize-addresses] report: ${path.relative(ROOT, reportPath)}`);

    await mongoose.disconnect();
    process.exit(0);
})().catch(err => {
    console.error("[normalize-addresses] FATAL:", err);
    process.exit(1);
});
