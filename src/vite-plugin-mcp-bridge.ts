import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";

interface Session {
  state: object | null;
  boards: object[] | null;
  activeBoardId: string | null;
  sse: ServerResponse | null;
  lastActivity: number;
}

interface PendingRequest {
  resolve: (result: object) => void;
  timer: NodeJS.Timeout;
}

const SESSION_TTL = 5 * 60 * 1000; // 5 minutes
const DISPATCH_TIMEOUT = 10_000; // 10 seconds
const KEEPALIVE_INTERVAL = 15_000; // 15 seconds

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: object) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export default function mcpBridge(): Plugin {
  const sessions = new Map<string, Session>();
  const pending = new Map<string, PendingRequest>();

  function evictStale() {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastActivity > SESSION_TTL) {
        s.sse?.end();
        sessions.delete(id);
      }
    }
  }

  function resolveClient(
    clientId: string | null,
    res: ServerResponse
  ): [string, Session] | null {
    if (clientId) {
      const s = sessions.get(clientId);
      if (!s) {
        json(res, 404, { error: "Unknown clientId." });
        return null;
      }
      return [clientId, s];
    }
    if (sessions.size === 0) {
      json(res, 404, {
        error:
          "No Wassily canvas connected. Run npm run dev and open Wassily in your browser.",
      });
      return null;
    }
    if (sessions.size > 1) {
      const ids = [...sessions.keys()].join(", ");
      json(res, 400, {
        error: `Multiple Wassily tabs open (clients: ${ids}). Specify clientId or close extra tabs.`,
      });
      return null;
    }
    const [id, s] = [...sessions.entries()][0];
    return [id, s];
  }

  function sendSSE(
    sseRes: ServerResponse,
    requestId: string,
    payload: object
  ) {
    sseRes.write(`id: ${requestId}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  function dispatchViaSSE(
    res: ServerResponse,
    session: Session,
    requestId: string,
    payload: object
  ) {
    if (!session.sse) {
      json(res, 502, { error: "Browser tab has no SSE connection." });
      return;
    }
    sendSSE(session.sse, requestId, payload);
    const timer = setTimeout(() => {
      pending.delete(requestId);
      json(res, 504, {
        error: "Dispatch timed out. Is the canvas tab focused?",
      });
    }, DISPATCH_TIMEOUT);
    pending.set(requestId, {
      resolve: (result) => {
        clearTimeout(timer);
        pending.delete(requestId);
        json(res, 200, result);
      },
      timer,
    });
  }

  return {
    name: "mcp-bridge",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__mcp__/")) return next();

        evictStale();

        const url = new URL(req.url, "http://localhost");
        const path = url.pathname;
        const method = req.method;

        // --- POST /state: browser pushes state ---
        if (path === "/__mcp__/state" && method === "POST") {
          readBody(req).then((raw) => {
            const body = JSON.parse(raw);
            const { clientId, state, boards, activeBoardId } = body;
            let s = sessions.get(clientId);
            if (!s) {
              s = {
                state: null,
                boards: null,
                activeBoardId: null,
                sse: null,
                lastActivity: Date.now(),
              };
              sessions.set(clientId, s);
            }
            s.state = state;
            s.boards = boards;
            s.activeBoardId = activeBoardId;
            s.lastActivity = Date.now();
            json(res, 200, { ok: true });
          });
          return;
        }

        // --- GET /state: MCP reads state ---
        if (path === "/__mcp__/state" && method === "GET") {
          const clientId = url.searchParams.get("clientId");
          const resolved = resolveClient(clientId, res);
          if (!resolved) return;
          const [, s] = resolved;
          s.lastActivity = Date.now();
          json(res, 200, {
            state: s.state,
            boards: s.boards,
            activeBoardId: s.activeBoardId,
          });
          return;
        }

        // --- GET /boards: MCP reads board list ---
        if (path === "/__mcp__/boards" && method === "GET") {
          const clientId = url.searchParams.get("clientId");
          const resolved = resolveClient(clientId, res);
          if (!resolved) return;
          const [, s] = resolved;
          s.lastActivity = Date.now();
          json(res, 200, {
            boards: s.boards,
            activeBoardId: s.activeBoardId,
          });
          return;
        }

        // --- POST /dispatch: MCP sends actions ---
        if (path === "/__mcp__/dispatch" && method === "POST") {
          readBody(req).then((raw) => {
            const body = JSON.parse(raw);
            const { actions, clientId } = body;
            const resolved = resolveClient(clientId ?? null, res);
            if (!resolved) return;
            const [, session] = resolved;
            session.lastActivity = Date.now();
            const requestId = crypto.randomUUID();
            dispatchViaSSE(res, session, requestId, {
              type: "dispatch",
              requestId,
              actions,
            });
          });
          return;
        }

        // --- POST /result: browser posts dispatch result ---
        if (path === "/__mcp__/result" && method === "POST") {
          readBody(req).then((raw) => {
            const body = JSON.parse(raw);
            const { requestId, clientId } = body;
            const s = sessions.get(clientId);
            if (s) s.lastActivity = Date.now();
            const p = pending.get(requestId);
            if (p) {
              p.resolve(body);
            }
            json(res, 200, { ok: true });
          });
          return;
        }

        // --- GET /events: browser connects SSE ---
        if (path === "/__mcp__/events" && method === "GET") {
          const clientId = url.searchParams.get("clientId");
          if (!clientId) {
            json(res, 400, { error: "clientId required." });
            return;
          }
          let s = sessions.get(clientId);
          if (!s) {
            s = {
              state: null,
              boards: null,
              activeBoardId: null,
              sse: null,
              lastActivity: Date.now(),
            };
            sessions.set(clientId, s);
          }
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          res.write(":ok\n\n");
          s.sse = res;
          s.lastActivity = Date.now();
          console.log("[mcp-bridge] SSE connected:", clientId);

          const keepalive = setInterval(() => {
            res.write(":keepalive\n\n");
          }, KEEPALIVE_INTERVAL);

          req.on("close", () => {
            clearInterval(keepalive);
            if (s && s.sse === res) s.sse = null;
            console.log("[mcp-bridge] SSE disconnected:", clientId);
          });
          return;
        }

        // --- POST /board-op: MCP sends board operation ---
        if (path === "/__mcp__/board-op" && method === "POST") {
          readBody(req).then((raw) => {
            const body = JSON.parse(raw);
            const { clientId, op, ...params } = body;
            const resolved = resolveClient(clientId ?? null, res);
            if (!resolved) return;
            const [, session] = resolved;
            session.lastActivity = Date.now();
            const requestId = crypto.randomUUID();
            dispatchViaSSE(res, session, requestId, {
              type: "board-op",
              requestId,
              op,
              ...params,
            });
          });
          return;
        }

        // --- POST /board-result: browser posts board-op result ---
        if (path === "/__mcp__/board-result" && method === "POST") {
          readBody(req).then((raw) => {
            const body = JSON.parse(raw);
            const { requestId, clientId } = body;
            const s = sessions.get(clientId);
            if (s) s.lastActivity = Date.now();
            const p = pending.get(requestId);
            if (p) {
              p.resolve(body);
            }
            json(res, 200, { ok: true });
          });
          return;
        }

        next();
      });
    },
  };
}
