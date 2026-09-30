import type { IncomingMessage, ServerResponse } from "node:http";
import { createStorageHandler } from "../server/storage-handler";

/** Shared file storage for Vite development. MCP runs on a separate loopback listener controlled by the dev sidebar. */
export function apostilStoragePlugin(options: { directory?: string } = {}) {
  return {
    name: "apostil-storage",
    apply: "serve" as const,
    configureServer(server: { config: { root: string }; httpServer?: { once(event: "close", callback: () => void): unknown } | null; middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      const storage = createStorageHandler(server.config.root, options.directory, true);
      server.httpServer?.once("close", () => { void import("../mcp/dev").then(m => m.closeMCPDevController(server.config.root, options.directory)); });
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/api/apostil") { next(); return; }
        void (async () => {
          const url = new URL(req.url!, `http://${req.headers.host}`);
          const origin = req.headers.origin;
          // Same-origin local development only; do not expose comments to arbitrary websites.
          if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
            (origin && origin !== url.origin) || req.headers["sec-fetch-site"] === "cross-site" ||
            (req.method === "POST" && !origin)) {
            res.writeHead(403); res.end(JSON.stringify({ error: "Local same-origin requests only." })); return;
          }
          if (req.method !== "GET" && req.method !== "POST") { res.writeHead(405); res.end(); return; }
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of req) {
            length += Buffer.byteLength(chunk);
            if (length > 16 * 1024 * 1024) { res.writeHead(413); res.end(); return; }
            chunks.push(Buffer.from(chunk));
          }
          const headers = new Headers();
          for (const name of ["origin", "sec-fetch-site", "x-apostil-mcp"]) {
            const value = req.headers[name];
            if (typeof value === "string") headers.set(name, value);
          }
          headers.set("Content-Type", "application/json");
          const request = new Request(url, { method: req.method, headers, ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
          const response = await storage[req.method](request);
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        })().catch(() => { res.writeHead(500); res.end(JSON.stringify({ error: "Comment storage failed." })); });
      });
    },
  };
}
