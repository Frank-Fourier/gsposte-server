import express, { NextFunction, Request, Response } from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import ora from "ora";
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

import { MONGO_URI } from "@utils/mongo";
import { logger } from "@utils/winston";
import { cors } from "@utils/cors";
import { swaggerUi, serveSwagger } from "@utils/swagger";
import { generateSystemUser } from "@utils/system";

@provide(ExpressServer)
export class ExpressServer {
    app: express.Application;
    routes: Route[] = [
        ioc.resolve(AuthRoute),
        ioc.resolve(UserRoute),
        ioc.resolve(SenderRoute),
        ioc.resolve(RecipientRoute),
        ioc.resolve(RubricRoute),
        ioc.resolve(LetterRoute),
        ioc.resolve(PdfRoute),
    ];

    constructor(
        private authService: AuthService,
        private userService: UserService,
    ) {
        logger.info("Starting server");
        this.app = express();
        this.setupConfig();
        this.setupDatabase();
        this.setupRoutes();
        this.setupPassport();
        this.setupSystemUser();
        this.setupSwagger();
    }

    private setupConfig() {
        const spinner = this.makeSpinner("Setting up config!");
        this.app.use(bodyParser.json());
        this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
            if (err instanceof SyntaxError && "body" in err) {
                return res.status(400).send({ message: "Bad JSON" })
            }
            next();
        });
        this.app.use(bodyParser.urlencoded({ extended: false }));
        this.app.use(cors);
        this.app.use(helmet());
        this.app.disable("x-powered-by");
        spinner && spinner.succeed();
    }

    private setupDatabase() {
        const spinner = this.makeSpinner("Connecting to database!");
        mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useCreateIndex: true,
            useFindAndModify: false,
            useUnifiedTopology: true,
        }).then(() => spinner && spinner.succeed("Connected to database!"))
          .catch(err => {
              spinner && spinner.fail("Couldn't connect to database...");
              logger.error("◇ Failed to connect to MongoDB!", err);
          });
    }

    private setupRoutes() {
        const spinner = this.makeSpinner("Setting up endpoints!");
        this.routes.forEach(route => route.makeRoutes(this.app));
        spinner && spinner.succeed();
    }

    private setupPassport() {
        const spinner = this.makeSpinner("Setting up passport authentication!");
        this.app.use(this.authService.getPassportMiddleware());
        spinner && spinner.succeed();
    }

    private async setupSystemUser() {
        if (await this.userService.countDocuments() > 0 || process.env.NODE_ENV === "test") return;
        await generateSystemUser();
    }

    private setupSwagger() {
        if (process.env.NODE_ENV === "test") return;
        const spinner = this.makeSpinner("Setting up Swagger documentation!");
        this.app.use("/docs", serveSwagger, swaggerUi);
        spinner && spinner.succeed("Swagger is available at /docs!");
    }

    private makeSpinner(text: string): ora.Ora {
        if (process.env.NODE_ENV === "test") return null;
        return ora(text).start();
    }

}
