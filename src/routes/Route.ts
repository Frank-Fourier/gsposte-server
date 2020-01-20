import { Application, NextFunction, Request, Response } from "express";
import { injectable, unmanaged } from "inversify";
import { authenticate } from "passport";

type ExpressMiddleware = (req: Request, res: Response, next?: NextFunction) => Promise<any>;

export enum RequestMethod {
    POST = "post",
    GET = "get",
    PUT = "put",
    DELETE = "delete"
}

// Route descriptor
export interface RouteInfo {
    path?: string
    method: RequestMethod
    requiresAuth: boolean
    handler: ExpressMiddleware
    middleware?: ExpressMiddleware
}

/**
 * @swagger
 *
 * responses:
 *   BadRequest:
 *      description: Invalid request body
 *   Unauthorized:
 *     description: Invalid or expired authorization
 *   Forbidden:
 *     description: Higher privileges are required for this call
 *   NotFound:
 *     description: The specified resource was not found
 */

@injectable()
export class Route {

    constructor(@unmanaged() public path: string,
                @unmanaged() public routes: RouteInfo[] = [])
    {}

    makeRoutes(app: Application) {
        this.routes.forEach(route => {
            const path = `${process.env.API_PATH}${this.path}${route.path || ""}`;

            const routeHandler = async (req: Request, res: Response) => {
                route.handler(req, res).catch(err => res.status(err.statusCode || 500).send(err));
            };

            route.requiresAuth ?
                app.route(path)[route.method](
                    authenticate("jwt", { session: false }),
                    (req, res) => routeHandler(req, res)
                ) :
                app.route(path)[route.method](
                    (req, res, next) => route.middleware ? route.middleware(req, res, next) : next(),
                    (req, res) => routeHandler(req, res)
                );
        });
    }

}
