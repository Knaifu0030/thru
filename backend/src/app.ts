import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AppConfig } from "./config.js";
import { getWebcmdDiagnostic } from "./webcmd-diagnostic.js";

const METHODS = "GET, POST, OPTIONS";
const HEADERS = "Content-Type, X-Forge-Admin-Key";

interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

function setCors(req: IncomingMessage, res: ServerResponse, config: AppConfig): boolean {
  const origin = req.headers.origin?.replace(/\/$/, "");
  if (!origin) return true;
  if (!config.allowedOrigins.has(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", METHODS);
  res.setHeader("Access-Control-Allow-Headers", HEADERS);
  res.setHeader("Vary", "Origin");
  return true;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function errorBody(code: string, message: string, requestId: string): ErrorBody {
  return { error: { code, message, requestId } };
}

export function createForgeServer(config: AppConfig) {
  return createServer((req, res) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);

    try {
      const corsAllowed = setCors(req, res, config);
      if (!corsAllowed) {
        json(res, 403, errorBody("origin_not_allowed", "This origin is not allowed.", requestId));
        return;
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204, { "Cache-Control": "no-store" });
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", "http://forge.internal");
      if (req.method === "GET" && url.pathname === "/health") {
        const webcmd = getWebcmdDiagnostic();
        json(res, 200, {
          status: webcmd.status === "ready" ? "ok" : "degraded",
          service: "forge-backend",
          version: config.version,
          webcmd,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/hello") {
        json(res, 200, {
          status: "online",
          service: "forge-backend",
          version: config.version,
          message: "Forge deployment online",
          webcmd: getWebcmdDiagnostic(),
        });
        return;
      }

      json(res, 404, errorBody("not_found", "Route not found.", requestId));
    } catch {
      json(res, 500, errorBody("internal_error", "Forge could not complete this request.", requestId));
    }
  });
}

