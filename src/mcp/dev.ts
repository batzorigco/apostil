import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { CommentStore } from "../server/comment-store";
import { connectProject } from "./connect";
import { startHTTPMCP } from "./http";

export class MCPDevController {
  private settings = { port: 3846, enabled: false };
  private running?: Awaited<ReturnType<typeof startHTTPMCP>>;
  private error?: string;
  private queue: Promise<unknown> = Promise.resolve();
  private store: CommentStore;
  private filename: string;
  readonly ready: Promise<void>;
  constructor(project: string, directory?: string) {
    this.store = new CommentStore(project, directory);
    this.filename = path.join(this.store.directory, ".mcp-settings");
    this.ready = this.restore().catch(error => { this.error = error.message; });
  }
  private async restore() {
    if (!await this.store.ensureDirectory()) return;
    let file;
    try {
      file = await fs.open(this.filename, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 4096) throw new Error("Invalid MCP settings file.");
      const saved = JSON.parse(await file.readFile("utf8"));
      if (!Number.isInteger(saved.port) || saved.port < 1024 || saved.port > 65535 || typeof saved.enabled !== "boolean") throw new Error("Invalid MCP settings file.");
      this.settings = { port: saved.port, enabled: saved.enabled };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    finally { await file?.close(); }
    if (this.settings.enabled) await this.start();
  }
  private async save() {
    await this.store.ensureDirectory(true);
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(this.settings), { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, this.filename);
    } finally { await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  }
  private async start() {
    if (this.running) return;
    try { this.running = await startHTTPMCP({ project: this.store.project, directory: this.store.directory, port: this.settings.port }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") throw new Error(`Port ${this.settings.port} is in use. Choose another port.`);
      throw error;
    }
  }
  status() {
    return { running: !!this.running, port: this.settings.port, url: `http://127.0.0.1:${this.settings.port}/mcp`, clients: this.running?.clients() ?? [], error: this.error };
  }
  async close() { await this.ready; await this.queue; await this.running?.close(); this.running = undefined; }
  async handle(request: Request) {
    // A custom header forces cross-origin browsers through a preflight we do not allow.
    const url = new URL(request.url);
    if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      request.headers.get("X-Apostil-MCP") !== "1" ||
      (request.headers.has("origin") && request.headers.get("origin") !== url.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });
    const operation = this.queue.catch(() => {}).then(async () => {
      await this.ready;
      try {
        let message;
        if (request.method === "POST") {
          const raw = await request.text();
          if (raw.length > 1024) throw new Error("Invalid MCP request.");
          const body = JSON.parse(raw);
          if (body.action === "start") {
            if (!Number.isInteger(body.port) || body.port < 1024 || body.port > 65535) throw new Error("Choose a port between 1024 and 65535.");
            if (this.running && body.port !== this.settings.port) throw new Error("Stop MCP before changing its port.");
            this.settings.port = body.port;
            await this.start();
            this.settings.enabled = true;
            try { await this.save(); } catch (error) { await this.running?.close(); this.running = undefined; throw error; }
          } else if (body.action === "stop") {
            // Save first so a failed write does not unexpectedly re-enable MCP on restart.
            this.settings.enabled = false;
            await this.save();
            await this.running?.close(); this.running = undefined;
          } else if (body.action === "connect" && (body.client === "claude" || body.client === "codex")) {
            if (!this.running) throw new Error("Start MCP before connecting an AI client.");
            await connectProject({ project: this.store.project, client: body.client, url: this.status().url, updateGenerated: true });
            message = `Configured ${body.client === "claude" ? "Claude Code" : "Codex"}. Restart it in this project and approve the connection when prompted.`;
          } else throw new Error("Unknown MCP action.");
          this.error = undefined;
        } else if (request.method !== "GET") return new Response(null, { status: 405 });
        return Response.json({ ...this.status(), message }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        this.error = error instanceof Error ? error.message : "MCP setup failed.";
        return Response.json(this.status(), { status: 400, headers: { "Cache-Control": "no-store" } });
      }
    });
    this.queue = operation;
    return operation;
  }
}

// Keep one listener per project across development hot reloads.
const key = Symbol.for("apostil.mcp.dev");
const globalState = globalThis as typeof globalThis & { [key]?: Map<string, MCPDevController> };
const controllers = globalState[key] ??= new Map();
export function getMCPDevController(project: string, directory?: string) {
  const id = new CommentStore(project, directory).directory;
  let controller = controllers.get(id);
  if (!controller) { controller = new MCPDevController(project, directory); controllers.set(id, controller); }
  return controller;
}
export async function closeMCPDevController(project: string, directory?: string) {
  const id = new CommentStore(project, directory).directory;
  const controller = controllers.get(id);
  controllers.delete(id);
  await controller?.close();
}
