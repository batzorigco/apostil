// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { apostilStoragePlugin } from "../src/adapters/vite";
let project: string;
let middleware: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
beforeEach(async () => {
  project = await fs.mkdtemp(path.join(os.tmpdir(), "apostil-vite-"));
  apostilStoragePlugin().configureServer({ config: { root: project }, middlewares: { use: callback => { middleware = callback; } } });
});
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });
function call(method: string, url: string, headers: Record<string, string>, body = "") {
  return new Promise<{ status: number; headers?: Record<string, string>; body: string }>(resolve => {
    const request = Object.assign(Readable.from(body ? [body] : []), { method, url, headers }) as IncomingMessage;
    let status = 200;
    let responseHeaders: Record<string, string> | undefined;
    const response = { writeHead(code: number, headers?: Record<string, string>) { status = code; responseHeaders = headers; return this; }, end(body = "") { resolve({ status, headers: responseHeaders, body }); } } as ServerResponse;
    middleware(request, response, () => resolve({ status: 404, body: "next" }));
  });
}
it("serves shared storage on localhost and advertises merge support", async () => {
  const headers = { host: "localhost:5173", origin: "http://localhost:5173" };
  expect((await call("POST", "/api/apostil?pageId=home", headers, "[]")).status).toBe(200);
  const response = await call("GET", "/api/apostil?pageId=home", { host: "localhost:5173" });
  expect(response.body).toBe("[]");
  expect(response.headers?.["x-apostil-storage"]).toBe("merge-v1");
});
it("rejects cross-origin access and POSTs without an origin", async () => {
  expect((await call("POST", "/api/apostil?pageId=home", { host: "localhost:5173" }, "[]")).status).toBe(403);
  expect((await call("POST", "/api/apostil?pageId=home", { host: "localhost:5173", origin: "https://other.example" }, "[]")).status).toBe(403);
  expect((await call("GET", "/api/apostil", { host: "other.example" })).status).toBe(403);
  expect((await call("GET", "/api/apostil", { host: "localhost:5173", "sec-fetch-site": "cross-site" })).status).toBe(403);
  expect(await fs.readdir(project)).toEqual([]);
});
it("passes unrelated requests to the app", async () => {
  expect((await call("GET", "/settings", { host: "localhost:5173" })).body).toBe("next");
});
