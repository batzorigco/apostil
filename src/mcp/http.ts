import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createApostilMCPServer, type MCPOptions } from "./server";

/** Local native MCP clients only. Browser control lives on the app's same-origin route. */
export async function startHTTPMCP(options: MCPOptions & { port: number }) {
  type Session = { transport: StreamableHTTPServerTransport; server: ReturnType<typeof createApostilMCPServer>; name?: string; lastSeen: number };
  const sessions = new Map<string, Session>();
  const http = createServer((req, res) => {
    void (async () => {
      const address = http.address();
      const host = typeof address === "object" && address ? `127.0.0.1:${address.port}` : "";
      if (req.headers.host !== host || req.headers.origin || req.headers["sec-fetch-site"]) {
        res.writeHead(403).end(); return;
      }
      if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
      if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) { res.writeHead(405).end(); return; }
      let body;
      if (req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("application/json")) { res.writeHead(415).end(); return; }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 1024 * 1024) { res.writeHead(413).end(); return; }
          chunks.push(Buffer.from(chunk));
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { res.writeHead(400).end(); return; }
      }
      const id = req.headers["mcp-session-id"];
      let session = typeof id === "string" ? sessions.get(id) : undefined;
      if (!session) {
        if (id) { res.writeHead(404).end(); return; }
        if (req.method !== "POST" || !isInitializeRequest(body)) { res.writeHead(400).end(); return; }
        if (sessions.size >= 32) { res.writeHead(503).end(); return; }
        const server = createApostilMCPServer(options);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID, enableJsonResponse: true,
          onsessioninitialized: id => { sessions.set(id, session!); },
          onsessionclosed: id => { const closed = sessions.get(id); sessions.delete(id); void closed?.server.close(); },
        });
        session = { transport, server, lastSeen: Date.now() };
        server.server.oninitialized = () => { session!.name = server.server.getClientVersion()?.name.slice(0,100) || "MCP client"; };
        await server.connect(transport);
      }
      session.lastSeen = Date.now();
      await session.transport.handleRequest(req, res, body);
      // Failed initialization must not leak a server instance.
      if (!session.transport.sessionId) await session.server.close();
    })().catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, "127.0.0.1", () => { http.off("error", reject); resolve(); });
  });
  const cleanup = setInterval(() => {
    for (const [id, session] of sessions) if (Date.now() - session.lastSeen > 30 * 60_000) {
      sessions.delete(id); void session.server.close();
    }
  }, 60_000);
  cleanup.unref();
  http.unref();
  return {
    port: (http.address() as { port: number }).port,
    clients: () => [...sessions.values()].filter(s => s.name).map(s => ({ name: s.name!, lastSeen: new Date(s.lastSeen).toISOString() })),
    async close() {
      clearInterval(cleanup);
      await Promise.all([...sessions.values()].map(s => s.server.close()));
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        http.close(error => error ? reject(error) : resolve());
        http.closeAllConnections();
      });
    },
  };
}
