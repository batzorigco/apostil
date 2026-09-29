// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
import { createAgentHandler, createLocalAgentHandler } from "../src/adapters/agents";

const body = { version: 1, requestId: "r1", provider: "codex", prompt: "Review feedback" };
const request = (data: unknown = body) => new Request("http://localhost:3000/api/apostil/ai", {
  method: "POST", headers: { "Content-Type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify(data),
});
afterEach(() => vi.unstubAllEnvs());

it("requires authorization before invoking an agent", async () => {
  const run = vi.fn();
  const handler = createAgentHandler({ authorize: () => false, run });
  expect((await handler(request())).status).toBe(403);
  expect(run).not.toHaveBeenCalled();
});
it("validates provider and payload size", async () => {
  const run = vi.fn();
  const handler = createAgentHandler({ authorize: () => true, run });
  expect((await handler(request({ ...body, provider: "sh" }))).status).toBe(400);
  expect((await handler(request({ ...body, prompt: "a".repeat(512 * 1024) }))).status).toBe(413);
  expect(run).not.toHaveBeenCalled();
});
it("deduplicates retries and prevents concurrent workspace edits", async () => {
  let finish!: (value: { message: string }) => void;
  const run = vi.fn(() => new Promise<{ message: string }>(resolve => { finish = resolve; }));
  const handler = createAgentHandler({ authorize: () => true, run, cwd: "/project" });
  const first = handler(request());
  await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
  const retry = handler(request());
  expect((await handler(request({ ...body, requestId: "r2" }))).status).toBe(409);
  finish({ message: "Completed" });
  expect(await (await first).json()).toEqual({ message: "Completed" });
  expect(await (await retry).json()).toEqual({ message: "Completed" });
  expect(run).toHaveBeenCalledExactlyOnceWith("codex", "Review feedback", "/project");
  expect((await handler(request({ ...body, prompt: "Changed" }))).status).toBe(409);
});
it("reports agent failure instead of claiming delivery succeeded", async () => {
  const handler = createAgentHandler({ authorize: () => true, run: vi.fn().mockRejectedValue(new Error("Sign in to Codex")) });
  const response = await handler(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "Sign in to Codex" });
});
it("disables the local connector in production and rejects other origins", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect((await createLocalAgentHandler()(request())).status).toBe(403);
  vi.stubEnv("NODE_ENV", "development");
  const foreign = request(); foreign.headers.set("origin", "https://example.com");
  expect((await createLocalAgentHandler()(foreign)).status).toBe(403);
});
