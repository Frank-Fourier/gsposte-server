import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import ora from "ora";
import helmet from "helmet";

import { inject } from "inversify";
import { provide } from "inversify-binding-decorators";
import { ioc } from "@ioc";

import { AuthService } from "@services/AuthService";
import { UserService } from "@services/UserService";

import { Route } from "@routes/Route";
import { AuthRoute } from "@routes/AuthRoute";
import { UserRoute } from "@routes/UserRoute";

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
        ioc.resolve(UserRoute)
    ];

    constructor(
        @inject(AuthService) private authService: AuthService,
        @inject(UserService) private userService: UserService,
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
        const spinner = ora("Setting up config!").start();
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: false }));
        this.app.use(cors);
        this.app.use(helmet());
        this.app.disable("x-powered-by");
        spinner.succeed();
    }

    private setupDatabase() {
        const spinner = ora("Connecting to database!").start();
        mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useCreateIndex: true,
            useFindAndModify: false,
            useUnifiedTopology: true,
        }).then(() => spinner.succeed("Connected to database!"))
          .catch(err => {
              spinner.fail("Couldn't connect to database...");
              logger.error("◇ Failed to connect to MongoDB!", err);
          });
    }

    private setupRoutes() {
        const spinner = ora("Setting up endpoints!").start();
        this.routes.forEach(route => route.makeRoutes(this.app));
        spinner.succeed();
    }

    private setupPassport() {
        const spinner = ora("Setting up passport authentication!").start();
        this.app.use(this.authService.getPassportMiddleware());
        spinner.succeed();
    }

    private async setupSystemUser() {
        if (await this.userService.countDocuments() > 0 || process.env.NODE_ENV === "test") return;
        await generateSystemUser();
    }

    private setupSwagger() {
        if (process.env.NODE_ENV === "test") return;
        const spinner = ora("Setting up Swagger documentation!").start();
        this.app.use("/docs", serveSwagger, swaggerUi);
        spinner.succeed("Swagger is available at /docs!");
    }

}
