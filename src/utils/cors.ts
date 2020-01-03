import { Request, Response, NextFunction } from "express";

const allowedOrigins = [
    "http://localhost:4200"
];

// CORS Middleware
export const cors = (req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", allowedOrigins.join(", ")); // Origins whitelist
    res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
};
