import winston from "winston";

export const logger = winston.createLogger();
const { combine, colorize, timestamp, splat, printf } = winston.format;
const colorizer = colorize({
    colors: {
        info: 'blue',
    }
});

logger.add(new winston.transports.Console({
    level: process.env.NODE_ENV !== "test" ? "info" : "error",
    format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
        splat(),
        printf(({ timestamp, level, message, ...args }) =>
            colorizer.colorize(level, `[${timestamp}] ${level.toUpperCase()}: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ""}`)
        )
    )
}));

if (process.env.NODE_ENV === "production") {
    logger.add(new winston.transports.File({
        filename: "error.log", level: "error"
    }));
}
