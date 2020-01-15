import winston from "winston";

export const logger = winston.createLogger();

logger.add(new winston.transports.Console({
    level: process.env.NODE_ENV !== "test" ? "info" : "error",
    format: winston.format.simple()
}));

if (process.env.NODE_ENV === "production") {
    logger.add(new winston.transports.File({
        filename: "error.log", level: "error"
    }));
}
