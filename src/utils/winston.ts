import winston from "winston";

export const logger = winston.createLogger({
    level: "info",
    format: winston.format.simple(),
    transports: [
        new winston.transports.Console({
            format: winston.format.colorize()
        })
    ]
});

if (process.env.NODE_ENV === "production") {
    logger.add(new winston.transports.File({
        filename: "error.logger", level: "error"
    }));
}
