import express, { NextFunction, Request, Response } from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import http from "http";
import helmet from "helmet";

import { provide } from "inversify-binding-decorators";
import { ioc } from "@ioc";

import { AuthService } from "@services/AuthService";
import { UserService } from "@services/UserService";

import { Route } from "@routes/Route";
import { AuthRoute } from "@routes/AuthRoute";
import { UserRoute } from "@routes/UserRoute";
import { SenderRoute } from "@routes/SenderRoute";
import { RecipientRoute } from "@routes/RecipientRoute";
import { RubricRoute } from "@routes/RubricRoute";
import { LetterRoute } from "@routes/LetterRoute";
import { PdfRoute } from "@routes/PdfRoute";
import { MunicipalityRoute } from "@routes/MunicipalityRoute";
import { PriceRoute } from "@routes/PriceRoute";
import { InvoiceRoute } from "@routes/InvoiceRoute";
import { TvReportRoute } from "@routes/TvReportRoute";
import { StatsRoute } from "@routes/StatsRoute";
import { ProvisionRoute } from "@routes/ProvisionRoute";
import { NoticeRoute } from "@routes/NoticeRoute";
import { ImageRoute } from "@routes/ImageRoute";
import { RevenueShareRoute } from "@routes/RevenueShareRoute";

import { MONGO_URI } from "@utils/mongo";
import { logger } from "@utils/winston";
import { cors } from "@utils/cors";
import { swaggerUi, serveSwagger } from "@utils/swagger";
import { generateSystemUser, isTestEnv } from "@utils/system";
import { queryJob, uploadJob } from "@utils/cron";
import { initializeWebSocketServer, WebSocketClient } from "@utils/websockets";
import { initSentry, setupSentryErrorHandlers, setupSentryHandlers } from "@utils/sentry";
import { FicRoute } from "@routes/FicRoute";
import { RevenueShareService } from "@services/RevenueShareService";

@provide(ExpressServer)
export class ExpressServer {

    app: express.Application;
    server: http.Server;

    routes: Route[] = [
        ioc.resolve(AuthRoute),
        ioc.resolve(UserRoute),
        ioc.resolve(SenderRoute),
        ioc.resolve(RecipientRoute),
        ioc.resolve(RubricRoute),
        ioc.resolve(LetterRoute),
        ioc.resolve(PdfRoute),
        ioc.resolve(MunicipalityRoute),
        ioc.resolve(PriceRoute),
        ioc.resolve(InvoiceRoute),
        ioc.resolve(TvReportRoute),
        ioc.resolve(StatsRoute),
        ioc.resolve(ProvisionRoute),
        ioc.resolve(NoticeRoute),
        ioc.resolve(ImageRoute),
        ioc.resolve(FicRoute),
        ioc.resolve(RevenueShareRoute),
    ];

    constructor(
        private authService: AuthService,
        private userService: UserService,
    ) {
        logger.info("Starting server");
        this.app = express();
        this.server = http.createServer(this.app);

        this.setupSentry();
        this.setupConfig();
        this.setupDatabase();
        this.setupRoutes();
        this.setupPassport();
        this.setupSystemUser();
        this.setupRevenueShareSingleton();
        this.setupSwagger();
        this.setupCronJobs();
        this.setupWebSocket();
        this.setupSentryErrors();
    }

    private setupConfig() {
        logger.info("Setting up config!");
        this.app.use(bodyParser.json());
        this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
            if (err instanceof SyntaxError && "body" in err) {
                return res.status(400).send({ message: "Bad JSON" })
            }
            next();
        });
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(cors);
        this.app.use(helmet());
        this.app.use(express.static("public/assets"));
        this.app.disable("x-powered-by");

        // STATIC FILES ROUTES
        this.app.use("/documents", express.static(process.env.PDF_ROOT || "public/pdf"));
        this.app.use("/invoices", express.static(process.env.INVOICES_ROOT || "public/invoices"));
        this.app.use("/attachments", express.static(process.env.ATTACHMENTS_ROOT || "public/attachments"));
        this.app.use("/images", express.static(process.env.IMAGES_ROOT || "public/images"));
    }

    private setupDatabase() {
        logger.info("Connecting to database...");
        mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useCreateIndex: true,
            useFindAndModify: false,
            useUnifiedTopology: true,
        }).then(() => logger.info("Connected to database!"))
          .catch(err => logger.error("◇ Failed to connect to MongoDB!", err));
    }

    private setupRoutes() {
        logger.info("Setting up endpoints!");
        this.routes.forEach(route => route.makeRoutes(this.app));
    }

    private setupPassport() {
        logger.info("Setting up passport authentication!");
        this.app.use(this.authService.getPassportMiddleware());
    }

    private async setupSystemUser() {
        if (await this.userService.countDocuments() > 0 || isTestEnv()) return;
        await generateSystemUser();
    }

    /**
     * Bootstrap idempotente del singleton RevenueShareSetting "global".
     * Eseguito a ogni boot — se esiste già non fa nulla. Su prima installazione
     * crea il singleton con i 2 beneficiari di partenza (Solutions Srl + FFT, 50/50).
     */
    private async setupRevenueShareSingleton() {
        if (isTestEnv()) return;
        try {
            await ioc.resolve(RevenueShareService).bootstrapIfMissing();
        } catch (err) {
            logger.error("[RevenueShare] Bootstrap fallito:", err);
        }
    }

    private setupSwagger() {
        if (isTestEnv()) return;
        logger.info("Setting up Swagger documentation!");
        this.app.use("/docs", serveSwagger, swaggerUi);
    }

    private setupCronJobs() {
        if (isTestEnv()) return;
        logger.info("Starting CRON jobs...");
        uploadJob.start();
        queryJob.start();
    }

    private setupWebSocket() {
        logger.info("Starting WebSocket...");
        const wss = initializeWebSocketServer(this.server);
        // Poll every 10 seconds to see if any WS client disconnected unexpectedly
        setInterval(() => {
            logger.debug(`[WebSocket] Searching for dead WS connections in ${wss.clients.size} client(s).`);
            wss.clients.forEach((ws: WebSocketClient) => {
                if (!ws.isAlive) {
                    logger.debug(`[WebSocket] WebSocket client {${ws.id}} is dead. Terminating.`);
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 60000);
    }

    private setupSentry() {
        if (isTestEnv()) return;
        logger.info("Setting up Sentry tracing handlers...")
        initSentry(this.app);
        setupSentryHandlers(this.app);
    }

    private setupSentryErrors() {
        if (isTestEnv()) return;
        logger.info("Setting up Sentry error handlers...");
        setupSentryErrorHandlers(this.app);
    }

}
