import winston from "winston";

export const logger = winston.createLogger();
const { combine, colorize, timestamp, splat, printf } = winston.format;
const colorizer = colorize({ colors: { info: 'blue' } });

export const createLogFile = (filename: string, level = "info") => {
    const l = winston.createLogger();
    l.add(new winston.transports.File({
        level: level,
        dirname: process.env.LOG_ROOT || "public/logs",
        filename: filename,
        format: combine(
            timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
            splat(),
            printf(({ timestamp, level, message, ...args }) =>
                `[${timestamp}] ${level.toUpperCase()}: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ""}`
            )
        ),
    }));
    return l;
};
export const detachLogFile = (logger: winston.Logger) => logger.clear();

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
    logger.add(createLogFile("errors.log", "error"));
}
