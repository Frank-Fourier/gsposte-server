import { setup, serve } from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import packageJson from "../../package.json";

export const swaggerUi = setup(swaggerJSDoc({
    swaggerDefinition: {
        info: {
            title: "GSPoste API",
            version: packageJson.version,
            description: "API documentation for GSPoste"
        },
        host: `${process.env.SERVER_HOST || "http://localhost"}:${
            process.env.NODE_ENV !== "production" ? (process.env.SERVER_PORT || "5000") : ""
        }`,
        basePath: process.env.API_PATH
    },
    apis: [
        "src/models/*Model.ts",
        "src/services/*Service.ts",
        "src/controllers/*Controller.ts",
        "src/routes/*Route.ts"
    ]
}));

export const serveSwagger = serve;
