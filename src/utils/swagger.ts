import { setup, serve, SwaggerUiOptions } from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import packageJson from "../../package.json";

export const swaggerOptions: SwaggerUiOptions = {
    customCss: `
        .swagger-ui .topbar { display: none }
    `,
    customSiteTitle: "GSPoste API Docs"
};

export const swaggerUi = setup(swaggerJSDoc({
    swaggerDefinition: {
        info: {
            title: "GSPoste API",
            version: packageJson.version,
            description: "API documentation for GSPoste"
        },
        host: `${process.env.SERVER_HOST.replace("http://", "")}:${
            process.env.NODE_ENV !== "production" ? (process.env.SERVER_PORT || "5000") : ""
        }`,
        basePath: process.env.API_PATH
    },
    apis: [
        "src/models/**/*Model.ts",
        "src/services/**/*Service.ts",
        "src/services/*Repository.ts",
        "src/controllers/**/*Controller.ts",
        "src/routes/**/*Route.ts"
    ]
}), swaggerOptions);

export const serveSwagger = serve;
