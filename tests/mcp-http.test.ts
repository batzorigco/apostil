// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHTTPMCP } from "../src/mcp/http";
import { MCPDevController } from "../src/mcp/dev";

let project: string;
const cleanup: (() => Promise<unknown>)[] = [];
beforeEach(async () => { project = await fs.mkdtemp(path.join(os.tmpdir(), "apostil-http-")); });
afterEach(async () => { vi.unstubAllEnvs(); for (const close of cleanup.reverse()) await close(); cleanup.length = 0; await fs.rm(project, { recursive: true, force: true }); });

it("serves real MCP tools, reports initialized clients, and rejects browser/foreign-host requests", async () => {
  const server = await startHTTPMCP({ project, port: 0 });
  cleanup.push(() => server.close());
  const url = new URL(`http://127.0.0.1:${server.port}/mcp`);
  for (const headers of [{ origin: "https://other.example" }, { origin: url.origin }, { host: "other.example" }]) {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(url, { headers }, res => { res.resume(); resolve(res.statusCode); });
      req.on("error", reject); req.end();
    });
    expect(status).toBe(403);
  }
  const client = new Client({ name: "Test Claude", version: "1" });
  const transport = new StreamableHTTPClientTransport(url);
  cleanup.push(() => client.close());
  await client.connect(transport);
  expect((await client.listTools()).tools.map(t => t.name)).toContain("complete_task");
  expect(server.clients()).toEqual([expect.objectContaining({ name: "Test Claude", lastSeen: expect.any(String) })]);
  expect((await client.callTool({ name: "list_comments", arguments: {} })).structuredContent).toMatchObject({ total: 0 });
  await transport.terminateSession();
  expect(server.clients()).toEqual([]);
});

it("saves setup, restores on dev restart, configures clients and stops cleanly", async () => {
  const probe = await startHTTPMCP({ project, port: 0 });
  const port = probe.port; await probe.close();
  let controller = new MCPDevController(project);
  cleanup.push(() => controller.close());
  const request = (body?: object, headers: Record<string, string> = { "X-Apostil-MCP": "1", origin: "http://localhost:3000" }) => controller.handle(new Request("http://localhost:3000/api/apostil?mcp=1", { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
  expect((await request({ action: "start", port }, {})).status).toBe(403);
  expect((await request({ action: "start", port }, { "X-Apostil-MCP": "1", origin: "https://other.example" })).status).toBe(403);
  expect((await request({ action: "start", port: 80 })).status).toBe(400);
  expect(await (await request({ action: "start", port })).json()).toMatchObject({ running: true, port });
  expect((await request({ action: "connect", client: "claude" })).status).toBe(200);
  expect(JSON.parse(await fs.readFile(path.join(project, ".mcp.json"), "utf8")).mcpServers.apostil).toEqual({ type: "http", url: `http://127.0.0.1:${port}/mcp` });
  await controller.close();
  controller = new MCPDevController(project); await controller.ready;
  expect(controller.status().running).toBe(true);
  expect(await (await request({ action: "stop" })).json()).toMatchObject({ running: false });
  await expect(fetch(`http://127.0.0.1:${port}/mcp`)).rejects.toThrow();
  vi.stubEnv("NODE_ENV", "production");
  expect((await request({ action: "start", port })).status).toBe(403);
});

it("reports occupied ports without claiming MCP is running", async () => {
  const occupied = await startHTTPMCP({ project, port: 0 });
  cleanup.push(() => occupied.close());
  const controller = new MCPDevController(project); cleanup.push(() => controller.close());
  const response = await controller.handle(new Request("http://localhost:3000/api/apostil?mcp=1", { method: "POST", headers: { "X-Apostil-MCP": "1" }, body: JSON.stringify({ action: "start", port: occupied.port }) }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ running: false, error: expect.stringContaining("in use") });
});
