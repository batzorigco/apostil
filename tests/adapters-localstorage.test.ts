import { describe, it, expect, beforeEach } from "vitest";
import { localStorageAdapter } from "../src/adapters/localStorage";
import type { ApostilThread } from "../src/types";

const mockThread: ApostilThread = {
  id: "t1",
  pageId: "home",
  pinX: 50,
  pinY: 30,
  resolved: false,
  comments: [
    {
      id: "c1",
      threadId: "t1",
      author: { id: "u1", name: "Alice", color: "#f00" },
      body: "Test comment",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00Z",
};

describe("localStorageAdapter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when no data exists", async () => {
    const result = await localStorageAdapter.load("nonexistent");
    expect(result).toEqual([]);
  });

  it("saves and loads threads", async () => {
    await localStorageAdapter.save("home", [mockThread]);
    const result = await localStorageAdapter.load("home");
    expect(result).toEqual([mockThread]);
  });

  it("isolates threads by pageId", async () => {
    await localStorageAdapter.save("home", [mockThread]);
    const about = await localStorageAdapter.load("about");
    expect(about).toEqual([]);
  });

  it("overwrites existing data on save", async () => {
    await localStorageAdapter.save("home", [mockThread]);
    const updated = { ...mockThread, resolved: true };
    await localStorageAdapter.save("home", [updated]);
    const result = await localStorageAdapter.load("home");
    expect(result[0].resolved).toBe(true);
  });

  it("saves empty array", async () => {
    await localStorageAdapter.save("home", [mockThread]);
    await localStorageAdapter.save("home", []);
    const result = await localStorageAdapter.load("home");
    expect(result).toEqual([]);
  });

  it("uses apostil- prefix for storage keys", async () => {
    await localStorageAdapter.save("my-page", [mockThread]);
    const raw = localStorage.getItem("apostil-my-page");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual([mockThread]);
  });
});

it("loads all comment pages while ignoring user profiles and malformed keys", async () => {
  localStorage.clear();
  await localStorageAdapter.save("home", [mockThread]);
  await localStorageAdapter.save("about", [{ ...mockThread, id: "t2", pageId: "about" }]);
  localStorage.setItem("apostil-user", JSON.stringify({ name: "Alice" }));
  localStorage.setItem("apostil-broken", "invalid");
  const pages = await localStorageAdapter.loadAll!();
  expect(pages.map(page => page.pageId).sort()).toEqual(["about", "home"]);
});

it("imports browser comments without losing remote replies and keeps the browser backup", async () => {
  const { importLocalComments } = await import("../src/adapters/localStorage");
  localStorage.clear();
  await localStorageAdapter.save("home", [mockThread]);
  let remote = [{ ...mockThread, comments: [...mockThread.comments, { ...mockThread.comments[0], id: "agent", body: "AI reply" }] }];
  const storage = { load: async () => remote, save: async (_page: string, threads: ApostilThread[]) => { remote = threads; } };
  await importLocalComments(storage);
  await importLocalComments(storage);
  expect(remote[0].comments).toHaveLength(2);
  expect(await localStorageAdapter.load("home")).toEqual([mockThread]);
});
