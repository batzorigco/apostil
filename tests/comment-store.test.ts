// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CommentStore } from "../src/server/comment-store";
import { createStorageHandler } from "../src/server/storage-handler";
import { createRestAdapter } from "../src/adapters/rest";
import { vi } from "vitest";
import type { ApostilThread } from "../src/types";
let project: string;
let store: CommentStore;
const thread: ApostilThread = { id: "t1", pageId: "home", pinX: 10, pinY: 20, resolved: false, createdAt: "2026-01-01", comments: [{ id: "c1", threadId: "t1", author: { id: "u1", name: "Alice", color: "red" }, body: "Feedback", createdAt: "2026-01-01" }] };
beforeEach(async () => { project = await fs.mkdtemp(path.join(os.tmpdir(), "apostil-store-")); store = new CommentStore(project); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(project, { recursive: true, force: true }); });

it("preserves concurrent replies and browser edits", async () => {
  await store.save("home", [thread]);
  await Promise.all([
    store.reply("home", "t1", "Reply one", "r1", "Codex"),
    store.reply("home", "t1", "Reply two", "r2", "Claude"),
    store.save("home", [{ ...thread, resolved: true }], [thread]),
  ]);
  const [saved] = await store.load("home");
  expect(saved.comments).toHaveLength(3);
  expect(saved.resolved).toBe(true);
});
it("does not let a stale browser delete newly created threads or replies", async () => {
  await store.save("home", [thread]);
  await store.reply("home", "t1", "New reply", "r1", "Codex");
  await expect(store.save("home", [], [thread])).rejects.toThrow("changed");
  expect((await store.load("home"))[0].comments).toHaveLength(2);
  const t2 = { ...thread, id: "t2", comments: [] };
  await store.save("home", [thread, t2], [thread]);
  await store.save("home", [thread], [thread]);
  expect(await store.load("home")).toHaveLength(2);
});
it("lets a browser delete a thread after an earlier save stored a derived status on it", async () => {
  const t2 = { ...thread, id: "t2", comments: [] };
  await store.save("home", [thread], []);
  await store.save("home", [thread, t2], [thread]);
  expect((await store.load("home"))[0].status).toBe("open");
  // The browser's baseline is its own copy, which never had the status key.
  await store.save("home", [t2], [thread, t2]);
  expect((await store.load("home")).map(t => t.id)).toEqual(["t2"]);
});
it("does not resurrect deleted threads from a stale page", async () => {
  await store.save("home", [thread]);
  await store.save("home", [], [thread]);
  await store.save("home", [thread], [thread]);
  expect(await store.load("home")).toEqual([]);
});
it("rejects corrupt files and symlinks without replacing the data", async () => {
  await fs.mkdir(path.join(project, ".apostil"));
  const file = path.join(project, ".apostil", "home.json");
  await fs.writeFile(file, "broken");
  await expect(store.save("home", [thread])).rejects.toThrow();
  expect(await fs.readFile(file, "utf8")).toBe("broken");
  await fs.unlink(file);
  await fs.writeFile(path.join(project, "private.json"), JSON.stringify([thread]));
  await fs.symlink(path.join(project, "private.json"), file);
  await expect(store.load("home")).rejects.toThrow();
  expect(() => new CommentStore(project, "../outside")).toThrow("inside the project");
});
it("prevents collisions between legacy sanitized page names", async () => {
  await store.save("settings.v2", [{ ...thread, pageId: "settings.v2" }]);
  await expect(store.load("settingsv2")).rejects.toThrow("collides");
  expect((await store.loadAll())[0].pageId).toBe("settings.v2");
});
it("round trips browser saves and MCP replies through the actual shared HTTP handler", async () => {
  const handler = createStorageHandler(project);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(`http://localhost${input}`, init);
    return request.method === "POST" ? handler.POST(request) : handler.GET(request);
  });
  const adapter = createRestAdapter("/api/apostil");
  await adapter.load("home");
  await adapter.save("home", [thread]);
  await store.reply("home", "t1", "Updated the UI", "r1", "Codex");
  await adapter.save("home", [{ ...thread, resolved: true }]);
  const [saved] = await adapter.load("home");
  expect(saved.comments).toHaveLength(2);
  expect(saved.resolved).toBe(true);
  expect(await adapter.loadAll!()).toHaveLength(1);
});
it("rejects cross-site and non-JSON requests on the shared HTTP handler without writing", async () => {
  const handler = createStorageHandler(project);
  const url = "http://localhost:3000/api/apostil?pageId=home";
  const post = (headers: Record<string, string>) => handler.POST(new Request(url, { method: "POST", headers, body: JSON.stringify([thread]) }));
  const json = { "Content-Type": "application/json" };
  expect((await post({ ...json, Origin: "https://evil.example" })).status).toBe(403);
  expect((await post({ ...json, Origin: "null" })).status).toBe(403);
  expect((await post({ ...json, "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
  expect((await post({ "Content-Type": "text/plain", Origin: "http://localhost:3000" })).status).toBe(415);
  expect((await handler.GET(new Request(url, { headers: { "Sec-Fetch-Site": "cross-site" } }))).status).toBe(403);
  expect(await fs.readdir(project)).toEqual([]);
  expect((await post({ ...json, Origin: "http://localhost:3000", "Sec-Fetch-Site": "same-origin" })).status).toBe(200);
  // Behind a proxy request.url carries the internal host; the browser's Host is what Origin must match.
  expect((await post({ ...json, Origin: "https://app.example", Host: "app.example" })).status).toBe(200);
  expect((await post({ ...json, Origin: "https://evil.example", "X-Forwarded-Host": "app.example" })).status).toBe(403);
});

it("preserves MCP task states through stale browser saves and does not replay status on retry", async () => {
  await store.save("home", [thread]);
  await store.reply("home", "t1", "Needs your judgment", "review", "Codex", { status: "needs_review", details: "Check the new spacing." });
  await store.save("home", [thread], [thread]);
  expect((await store.load("home"))[0]).toMatchObject({ status: "needs_review", resolved: false });
  await store.reply("home", "t1", "Fixed", "done", "Codex", { status: "completed", details: "Browser and unit checks passed." });
  await store.save("home", [thread], [thread]);
  const [completed] = await store.load("home");
  expect(completed).toMatchObject({ status: "completed", resolved: true });
  // Older clients can still reopen by changing only the compatibility boolean.
  await store.save("home", [{ ...completed, resolved: false }], [completed]);
  await store.reply("home", "t1", "Fixed", "done", "Codex", { status: "completed", details: "Browser and unit checks passed." });
  expect((await store.load("home"))[0]).toMatchObject({ status: "open", resolved: false });
  expect((await store.load("home"))[0].comments).toHaveLength(3);
});

it("rejects invalid task metadata without persisting a partial outcome", async () => {
  await store.save("home", [thread]);
  await expect(store.reply("home", "t1", "Done", "bad", "Codex", { status: "completed", details: " " })).rejects.toThrow("Invalid comment data");
  expect((await store.load("home"))[0]).toEqual(thread);
  await expect(store.save("home", [{ ...thread, status: "invalid" } as unknown as ApostilThread])).rejects.toThrow("Invalid comment data");
});
