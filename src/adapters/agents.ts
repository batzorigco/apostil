/** Node-only connector for already authenticated local Codex / Claude Code CLIs. */
import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import type { ApostilAIProvider, ApostilAIRequest, ApostilAIResult } from "../types";

const MAX_BYTES = 512 * 1024;

export function runLocalAgent(provider: ApostilAIProvider, prompt: string, cwd: string): Promise<ApostilAIResult> {
  const args = provider === "codex"
    ? ["exec", "--sandbox", "workspace-write", "--color", "never", "-"]
    : ["--print", "--output-format", "json", "--permission-mode", "acceptEdits"];
  return new Promise((resolve, reject) => {
    // No shell interpolation. Respect CLI sandbox/permissions; do not bypass them.
    const child = execFile(provider, args, { cwd, timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { reject(new Error(`${provider} failed: ${stderr.trim().slice(-2000) || error.message}`)); return; }
      if (provider === "claude") {
        try {
          const result = JSON.parse(stdout);
          if (result.is_error || result.permission_denials?.length) {
            reject(new Error(result.result || "Claude needs additional tool permissions. Review the CLI configuration."));
          } else if (typeof result.result === "string") resolve({ message: result.result });
          else reject(new Error("Claude returned an unexpected result."));
        } catch { reject(new Error("Claude returned an invalid result.")); }
      } else resolve({ message: stdout.trim() || "Codex finished without a final message. Review the workspace changes." });
    });
    child.stdin?.on("error", () => { /* Process completion reports spawn / pipe failures. */ });
    child.stdin?.end(prompt);
  });
}

/** Authentication is mandatory for a custom deployment. Keep cwd server-controlled. */
export function createAgentHandler(options: {
  cwd?: string;
  authorize: (request: Request) => boolean | Promise<boolean>;
  run?: typeof runLocalAgent;
}) {
  const cwd = options.cwd ?? process.cwd();
  const run = options.run ?? runLocalAgent;
  const requests = new Map<string, { fingerprint: string; result: Promise<Response> }>();
  let busy = false;
  return async function POST(request: Request): Promise<Response> {
    if (!await options.authorize(request)) return Response.json({ error: "Agent connection is not authorized." }, { status: 403 });
    if (request.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
    if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Expected JSON." }, { status: 415 });
    let payload: ApostilAIRequest;
    try {
      // Bound memory even when the client omits Content-Length.
      const reader = request.body?.getReader();
      if (!reader) throw new Error("Missing body");
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) { await reader.cancel(); return Response.json({ error: "Feedback exceeds 512 KB. Send fewer comments." }, { status: 413 }); }
        chunks.push(value);
      }
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (payload.version !== 1 || !["codex", "claude"].includes(payload.provider) ||
        typeof payload.requestId !== "string" || !/^[\w-]{1,100}$/.test(payload.requestId) ||
        typeof payload.prompt !== "string" || !payload.prompt.trim()) throw new Error("Invalid request");
    } catch { return Response.json({ error: "Invalid agent request." }, { status: 400 }); }
    const fingerprint = createHash("sha256").update(payload.provider + payload.prompt).digest("hex");
    const existing = requests.get(payload.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return Response.json({ error: "Request ID already used for different feedback." }, { status: 409 });
      return (await existing.result).clone();
    }
    if (busy) return Response.json({ error: "An agent is already working in this project. Wait for it to finish." }, { status: 409 });
    busy = true;
    const result = Promise.resolve().then(() => run(payload.provider, payload.prompt, cwd))
      .then(output => Response.json(output))
      .catch(error => Response.json({ error: error instanceof Error ? error.message : "Agent failed." }, { status: 502 }))
      .finally(() => { busy = false; });
    requests.set(payload.requestId, { fingerprint, result });
    // Bound completed request history. Retries are idempotent within this process/history.
    if (requests.size > 100) requests.delete(requests.keys().next().value!);
    return (await result).clone();
  };
}

/** Local development only. Production integrations must provide their own authorization. */
export function createLocalAgentHandler(cwd = process.cwd()) {
  return createAgentHandler({ cwd, authorize: request => {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    return process.env.NODE_ENV === "development" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && origin === url.origin &&
      request.headers.get("sec-fetch-site") !== "cross-site";
  } });
}

/** Add to Vite's plugins array. Served on the dev server's own origin. */
export function apostilAgentPlugin() {
  const handler = createLocalAgentHandler();
  return {
    name: "apostil-agent",
    apply: "serve" as const,
    configureServer(server: { middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== "/api/apostil/ai") { next(); return; }
        void (async () => {
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of req) {
            length += Buffer.byteLength(chunk);
            if (length > MAX_BYTES) { res.writeHead(413); res.end(JSON.stringify({ error: "Feedback exceeds 512 KB." })); return; }
            chunks.push(Buffer.from(chunk));
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
          const response = await handler(request);
          res.writeHead(response.status, { "Content-Type": "application/json" });
          res.end(await response.text());
        })().catch(() => { res.writeHead(500); res.end(JSON.stringify({ error: "Agent connector failed." })); });
      });
    },
  };
}
