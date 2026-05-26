import { Request, Response } from "express";
import mongoose from "mongoose";
import { RequestMethod, Route } from "@routes/Route";
import { provide } from "inversify-binding-decorators";

/**
 * Liveness/readiness probe.
 *
 * GET /health → 200 sempre (liveness, è up il processo)
 * GET /health/ready → 200 se Mongo è connesso, 503 altrimenti (readiness)
 *
 * Public, no auth. Usato dal Docker healthcheck e da monitoring esterni.
 * Risponde JSON compatto, niente PII.
 */
@provide(HealthRoute)
export class HealthRoute extends Route {

    constructor() {
        super("/health", [
            {
                method: RequestMethod.GET,
                requiresAuth: false,
                handler: async (req: Request, res: Response) => {
                    res.status(200).json({
                        status: "ok",
                        uptime: Math.floor(process.uptime()),
                        timestamp: new Date().toISOString(),
                    });
                },
            },
            {
                path: "/ready",
                method: RequestMethod.GET,
                requiresAuth: false,
                handler: async (req: Request, res: Response) => {
                    const mongoState = mongoose.connection.readyState;
                    const mongoUp = mongoState === 1;
                    res.status(mongoUp ? 200 : 503).json({
                        status: mongoUp ? "ready" : "not-ready",
                        mongo: mongoState, // 0 disconnected, 1 connected, 2 connecting, 3 disconnecting
                        timestamp: new Date().toISOString(),
                    });
                },
            },
        ]);
    }

}
