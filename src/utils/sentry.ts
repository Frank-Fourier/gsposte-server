import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import { Application } from "express";

export function initSentry(app: Application) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: [
            // Enable HTTP calls tracing
            new Sentry.Integrations.Http({ tracing: true }),
            // Enable Express.js middleware tracing
            new Tracing.Integrations.Express({ app }),
        ],
        maxBreadcrumbs: 200,
        tracesSampleRate: 1.0,
        environment: process.env.NODE_ENV,
        release: `gsposte-server@${process.env.npm_package_version}`
    });
}

export function setupSentryHandlers(app: Application) {
    // RequestHandler creates a separate execution context using domains, so that every
    // transaction/span/breadcrumb is attached to its own Hub instance
    app.use(Sentry.Handlers.requestHandler());
    // TracingHandler creates a trace for every incoming request
    app.use(Sentry.Handlers.tracingHandler());
}

export function setupSentryErrorHandlers(app: Application) {
    app.use(Sentry.Handlers.errorHandler({
        shouldHandleError(error): boolean {
            return error.status > 400;
        }
    }));
}
