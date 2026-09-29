// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { createRestAdapter } from "../src/adapters/rest";
import { createStorageHandler } from "../src/server/storage-handler";
import { CommentStore } from "../src/server/comment-store";
import type { ApostilThread } from "../src/types";

const require = createRequire(import.meta.url);
const oldRest = require("./fixtures/apostil-0.2.0/adapters/rest.cjs") as typeof import("../src/adapters/rest");
const oldNext = require("./fixtures/apostil-0.2.0/adapters/nextjs.cjs") as typeof import("../src/adapters/nextjs");
const oldLocal = require("./fixtures/apostil-0.2.0/adapters/localStorage.cjs") as typeof import("../src/adapters/localStorage");
import { localStorageAdapter } from "../src/adapters/localStorage";

let project: string;
const seed = (pageId = "home"): ApostilThread => ({ id: "t1", pageId, pinX: 20, pinY: 30, targetId: "#save", resolved: false,
  createdAt: "2026-01-01T00:00:00Z", comments: [{ id: "c1", threadId: "t1", body: "Old feedback", createdAt: "2026-01-01T00:00:00Z",
    author: { id: "u1", name: "Reviewer", color: "#f00" } }] });
beforeEach(async () => { project = await fs.mkdtemp(path.join(os.tmpdir(), "apostil-compat-")); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await fs.rm(project, { recursive: true, force: true }); });
function serve(handler: ReturnType<typeof createStorageHandler>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(`http://localhost${input}`, init);
    return request.method === "POST" ? handler.POST(request) : handler.GET(request);
  });
}

for (const client of ["published", "current"] as const) for (const server of ["published", "current"] as const) {
  it(`${client} client / ${server} server reads, creates and replies to original records`, async () => {
    // The published handler reads cwd at request time; avoid changing process-wide cwd in a test worker.
    vi.spyOn(process, "cwd").mockReturnValue(project);
    const handler = server === "published" ? oldNext.createNextjsHandler() : createStorageHandler(project);
    serve(handler);
    const adapter = (client === "published" ? oldRest : { createRestAdapter }).createRestAdapter("/api/apostil");
    expect(await adapter.load("home")).toEqual([]);
    await adapter.save("home", [seed()]);
    const loaded = await adapter.load("home");
    expect(loaded).toEqual([seed()]);
    const reply = { ...loaded[0].comments[0], id: "reply", body: "One more detail" };
    await adapter.save("home", [{ ...loaded[0], comments: [...loaded[0].comments, reply] }]);
    expect((await adapter.load("home"))[0].comments).toEqual([...seed().comments, reply]);
    if (client === "published" && server === "current") return; // Unsupported ambiguous writes are covered below.
    const beforeResolve = await adapter.load("home");
    await adapter.save("home", beforeResolve.map(t => ({ ...t, resolved: true })));
    expect((await adapter.load("home"))[0].resolved).toBe(true);
    await adapter.save("home", []);
    expect(await adapter.load("home")).toEqual([]);
  });
}

it.each(["completed", "needs_review"] as const)("rejects a stale published client after an AI %s update without changing the file", async status => {
  const store = new CommentStore(project);
  await store.save("home", [seed()]);
  serve(createStorageHandler(project));
  const old = oldRest.createRestAdapter("/api/apostil");
  const stale = await old.load("home");
  await store.reply("home", "t1", "Updated", "r1", "Codex", { status, details: "Review the result." });
  const before = await fs.readFile(path.join(project, ".apostil/home.json"), "utf8");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await old.save("home", stale); // Published adapter swallows errors; check the HTTP result and actual file.
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("409"));
  expect(await fs.readFile(path.join(project, ".apostil/home.json"), "utf8")).toBe(before);
});

it("rejects stale legacy status-only changes and deletions, including omission of another reviewer's thread", async () => {
  const store = new CommentStore(project);
  await store.save("home", [seed()]);
  await store.save("home", [{ ...seed(), resolved: true, status: "completed" }], [seed()]);
  const handler = createStorageHandler(project);
  for (const body of [[seed()], []]) {
    const response = await handler.POST(new Request("http://localhost/api/apostil?pageId=home", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(409);
    expect((await store.load("home"))[0]).toMatchObject({ resolved: true, status: "completed" });
  }
  const before = await store.load("home");
  const second = { ...seed(), id: "t2", comments: [] };
  await store.save("home", [...before, second], before);
  await expect(store.save("home", before)).rejects.toThrow("updated Apostil client");
  expect(await store.load("home")).toHaveLength(2);
});

it("preserves review status when a legacy-shaped write omits the optional status field", async () => {
  const store = new CommentStore(project);
  await store.save("home", [{ ...seed(), status: "needs_review" }]);
  await store.save("home", [seed()]);
  expect((await store.load("home"))[0]).toMatchObject({ status: "needs_review", resolved: false });
});

it.each(["/", "日本語", "!!!"])("loads and updates a published %s page file, including All Pages and MCP storage", async pageId => {
  vi.spyOn(process, "cwd").mockReturnValue(project);
  const old = oldNext.createNextjsHandler();
  const url = `http://localhost/api/apostil?pageId=${encodeURIComponent(pageId)}`;
  expect((await old.POST(new Request(url, { method: "POST", body: JSON.stringify([seed(pageId)]) }))).status).toBe(200);
  const store = new CommentStore(project);
  expect(await store.load(pageId)).toEqual([seed(pageId)]);
  const modern = createStorageHandler(project);
  expect(await (await modern.GET(new Request(url))).json()).toEqual([seed(pageId)]);
  await store.reply(pageId, "t1", "Checked", "reply", "Codex");
  expect((await store.loadAll())[0]).toMatchObject({ pageId, threads: [{ comments: expect.arrayContaining([expect.objectContaining({ body: "Checked" })]) }] });
  expect(await (await old.GET(new Request(url))).json()).toEqual(await store.load(pageId));
  await expect(store.load(pageId === "/" ? "!!!" : "/")).rejects.toThrow("collides");
});

it("retains most-recent-first page ordering with actual page IDs", async () => {
  const store = new CommentStore(project);
  await store.save("a.old", [seed("a.old")]);
  await store.save("z.new", [{ ...seed("z.new"), createdAt: "2026-09-01T00:00:00Z" }]);
  expect((await store.loadAll()).map(p => p.pageId)).toEqual(["z.new", "a.old"]);
});

it("round trips published and current localStorage records using the original keys", async () => {
  const data = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value),
    key: (index: number) => [...data.keys()][index], get length() { return data.size; } });
  await oldLocal.localStorageAdapter.save("home", [seed()]);
  expect(await localStorageAdapter.load("home")).toEqual([seed()]);
  const updated = { ...seed(), status: "needs_review" as const };
  await localStorageAdapter.save("home", [updated]);
  expect(await oldLocal.localStorageAdapter.load("home")).toEqual([updated]);
  expect([...data.keys()]).toEqual(["apostil-home"]);
});
