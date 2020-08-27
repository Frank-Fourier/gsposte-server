import { logger } from "@utils/winston";
import WebSocket from "ws";
import http from "http";
import https from "https";

let WSS: WebSocket.Server;
const DEFAULT_SENDER = "GSPoste";

export class WebSocketClient extends WebSocket {
    isAlive: boolean;
    id: string;
}

export interface WSMessage {
    title: string
    content: string
    sender: string
    broadcast: boolean
}

export function createWebSocketServer(server: http.Server | https.Server): WebSocket.Server {
    const wss = new WebSocket.Server({ server });
    wss.on("connection", (ws: WebSocketClient, req: http.IncomingMessage) => {
        ws.isAlive = true;
        ws.on("pong", () => {
            ws.isAlive = true;
            logger.debug(`[WebSocket] {${ws.id}} is still alive!`);
        });

        ws.id = req.url.substr(req.url.lastIndexOf("/") + 1);
        ws.send(`Hello there! Your session ID is ${ws.id}.`);
        logger.debug(`[WebSocket] Client {${ws.id}} connected. Hello!`);
    });
    return wss;
}

export function initializeWebSocketServer(server: http.Server | https.Server): WebSocket.Server {
    WSS = createWebSocketServer(server);
    return WSS;
}

export function ws_message(clientId: string, title: string, content: string) {
    WSS?.clients.forEach((ws: WebSocketClient) => {
        if (ws.id !== clientId) {
            return;
        }
        ws.send(JSON.stringify({
            title: title,
            content: content,
            sender: DEFAULT_SENDER,
            broadcast: false
        } as WSMessage));
        logger.debug(`[WebSocket] Sent message to client {${clientId}}.`);
    });
}

export function ws_broadcast(title: string, content: string) {
    WSS?.clients.forEach((ws: WebSocketClient) => {
        ws.send(JSON.stringify({
            title: title,
            content: content,
            sender: DEFAULT_SENDER,
            broadcast: true
        } as WSMessage));
    });
    logger.debug(`[WebSocket] Broadcast message to ${WSS?.clients.size} client(s).`);
}
