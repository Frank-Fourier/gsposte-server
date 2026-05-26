import { Request, Response, NextFunction } from "express";
import { logger } from "@utils/winston";

/**
 * CORS middleware con whitelist via env `CORS_ORIGINS` (CSV).
 *
 * Comportamento:
 *   - Se la request ha un Origin presente in whitelist → echo dell'Origin
 *     in `Access-Control-Allow-Origin` (permette i cookie/credentials).
 *   - Se la request non ha Origin (es. curl, server-to-server) → passa
 *     senza header CORS (non rilevante).
 *   - Se l'Origin non è in whitelist → NON aggiungo header CORS, il browser
 *     blocca la response client-side. Log a livello warning per visibilità.
 *
 * Default (se `CORS_ORIGINS` mancante):
 *   - `NODE_ENV=production` → `https://portalepostale.it,https://www.portalepostale.it`
 *   - altrimenti → `*` (permissivo, comodo per dev locale)
 *
 * Tutte le response includono `Vary: Origin` per evitare cache-poisoning.
 */

const PROD_DEFAULT_ORIGINS = [
    "https://portalepostale.it",
    "https://www.portalepostale.it",
];

function getAllowedOrigins(): string[] | "*" {
    const raw = (process.env.CORS_ORIGINS || "").trim();
    if (raw) {
        return raw.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (process.env.NODE_ENV === "production") {
        return PROD_DEFAULT_ORIGINS;
    }
    return "*";
}

const allowedOrigins = getAllowedOrigins();
if (Array.isArray(allowedOrigins)) {
    logger.info(`[CORS] Allowed origins: ${allowedOrigins.join(", ")}`);
} else {
    logger.warn("[CORS] Wildcard '*' attivo (modalità dev). Imposta CORS_ORIGINS in produzione.");
}

export const cors = (req: Request, res: Response, next: NextFunction) => {
    const rawOrigin = req.headers.origin;
    const origin: string | undefined = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Max-Age", "600");

    if (origin) {
        if (allowedOrigins === "*") {
            res.header("Access-Control-Allow-Origin", origin);
        } else if (allowedOrigins.includes(origin)) {
            res.header("Access-Control-Allow-Origin", origin);
        } else {
            logger.warn(`[CORS] Origin rifiutato: '${origin}' (whitelist: ${allowedOrigins.join(", ")})`);
        }
    }

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    next();
};
