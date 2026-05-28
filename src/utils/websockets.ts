import { logger } from "@utils/winston";
import { Notice } from "@models/NoticeModel";
import WebSocket from "ws";
import http from "http";
import https from "https";

export class WebSocketClient extends WebSocket {
    isAlive: boolean;
    id: string;
}

let WSS: WebSocket.Server;

export function createWebSocketServer(server: http.Server | https.Server): WebSocket.Server {
    const wss = new WebSocket.Server({ server });
    wss.on("connection", (ws: WebSocketClient, req: http.IncomingMessage) => {
        ws.isAlive = true;
        ws.on("pong", () => {
            ws.isAlive = true;
            logger.debug(`[WebSocket] {${ws.id}} is still alive!`);
        });

        ws.id = req.url.substr(req.url.lastIndexOf("/") + 1);
        ws.send(JSON.stringify({
            title: "Hello!",
            content: `Hello there! Your session ID is ${ws.id}.`,
            sender: "Portale Postale",
            broadcast: false,
            error: false,
            data: {}
        } as Notice));
        logger.debug(`[WebSocket] Client {${ws.id}} connected. Hello!`);
    });
    return wss;
}

export function initializeWebSocketServer(server: http.Server | https.Server): WebSocket.Server {
    WSS = createWebSocketServer(server);
    return WSS;
}

export function ws_message(clientId: string, message: Partial<Notice>) {
    WSS?.clients.forEach((ws: WebSocketClient) => {
        if (ws.id !== clientId) {
            return;
        }
        ws.send(JSON.stringify(message));
        logger.debug(`[WebSocket] Sent message to client {${clientId}}.`);
    });
}

export function ws_broadcast(message: Partial<Notice>) {
    WSS?.clients.forEach((ws: WebSocketClient) => ws.send(JSON.stringify(message)));
    logger.debug(`[WebSocket] Broadcast message to ${WSS?.clients.size} client(s).`);
}
