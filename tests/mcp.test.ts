// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CommentStore } from "../src/server/comment-store";
import type { ApostilThread } from "../src/types";

const cli = path.resolve("bin/apostil.js");
let project: string;
let client: Client | undefined;
const thread: ApostilThread = {
  id: "thread-1", pageId: "settings", pinX: 30, pinY: 40, targetId: '#save', targetLabel: "Save settings",
  resolved: false, createdAt: "2026-01-01T00:00:00Z",
  comments: [{ id: "c1", threadId: "thread-1", author: { id: "u1", name: "Reviewer", color: "red" }, body: "Make Save more visible", createdAt: "2026-01-01T00:00:00Z" }],
};
beforeEach(async () => { project = await fs.mkdtemp(path.join(os.tmpdir(), "apostil-mcp-test-")); });
afterEach(async () => { await client?.close(); client = undefined; await fs.rm(project, { recursive: true, force: true }); });

async function connect(readOnly = false) {
  client = new Client({ name: "apostil-test", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, "mcp", "--project", project, "--author", "Codex", ...(readOnly ? ["--read-only"] : [])], stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", data => { stderr += data; });
  await client.connect(transport);
  return { client, stderr: () => stderr };
}

describe("real MCP stdio process", () => {
  it("initializes, discovers tools, reads snapshots and persists an idempotent reply", async () => {
    const store = new CommentStore(project);
    await store.save("settings", [thread]);
    const connection = await connect();
    const tools = await connection.client.listTools();
    expect(tools.tools.map(t => t.name)).toEqual(["list_comments", "get_comment_context", "reply_to_comment", "complete_task", "request_review"]);
    const listed = await connection.client.callTool({ name: "list_comments", arguments: {} });
    expect(listed.structuredContent).toMatchObject({ total: 1, threads: [{ threadId: "thread-1", pageId: "settings" }] });
    const context = await connection.client.callTool({ name: "get_comment_context", arguments: { pageId: "settings", threadId: "thread-1" } });
    expect(context.structuredContent).toMatchObject({ thread });
    const args = { pageId: "settings", threadId: "thread-1", body: "Updated the button contrast.", requestId: "reply-1" };
    expect((await connection.client.callTool({ name: "reply_to_comment", arguments: args })).isError).not.toBe(true);
    await connection.client.callTool({ name: "reply_to_comment", arguments: args });
    const saved = (await store.load("settings"))[0];
    expect(saved.comments).toHaveLength(2);
    expect(saved.comments[1].author.name).toBe("Codex");
    expect(saved.resolved).toBe(false);
    const conflict = await connection.client.callTool({ name: "reply_to_comment", arguments: { ...args, body: "Changed" } });
    expect(conflict.isError).toBe(true);
    expect(connection.stderr()).toBe("");
  });

  it("offers a project resource and a reusable prompt; reports missing context explicitly", async () => {
    const { client } = await connect();
    expect((await client.listResources()).resources[0].uri).toBe("apostil://project");
    const projectResource = await client.readResource({ uri: "apostil://project" });
    expect(projectResource.contents[0]).toHaveProperty("text");
    const prompt = await client.getPrompt({ name: "address_comments", arguments: { pageId: "settings" } });
    expect(prompt.messages[0].content).toMatchObject({ type: "text", text: expect.stringContaining("get_comment_context") });
    const missing = await client.callTool({ name: "get_comment_context", arguments: { pageId: "settings", threadId: "missing" } });
    expect(missing.isError).toBe(true);
    const empty = await client.callTool({ name: "list_comments", arguments: {} });
    expect(empty.structuredContent).toMatchObject({ total: 0, note: expect.stringContaining("browser-only") });
  });

  it("read-only mode has no write tool and schema validation rejects bad input", async () => {
    const { client } = await connect(true);
    expect((await client.listTools()).tools.map(t => t.name)).toEqual(["list_comments", "get_comment_context"]);
    expect((await client.callTool({ name: "list_comments", arguments: { limit: 1000 } })).isError).toBe(true);
  });
});

it("requests human review, completes verified work, and rejects incomplete outcomes over stdio", async () => {
  const store = new CommentStore(project);
  await store.save("settings", [thread]);
  const { client } = await connect();
  const identity = { pageId: "settings", threadId: thread.id };
  const review = { ...identity, summary: "Adjusted contrast.", reviewInstructions: "Check the button in dark mode.", requestId: "review-1" };
  expect((await client.callTool({ name: "request_review", arguments: review })).isError).not.toBe(true);
  await client.callTool({ name: "request_review", arguments: review });
  expect((await store.load("settings"))[0]).toMatchObject({ status: "needs_review", resolved: false, comments: expect.arrayContaining([expect.objectContaining({ taskUpdate: { status: "needs_review", details: review.reviewInstructions } })]) });
  expect((await store.load("settings"))[0].comments).toHaveLength(2);
  expect((await client.callTool({ name: "list_comments", arguments: { status: "needs_review" } })).structuredContent).toMatchObject({ total: 1 });
  expect((await client.callTool({ name: "list_comments", arguments: {} })).structuredContent).toMatchObject({ total: 1 });
  expect((await client.callTool({ name: "complete_task", arguments: { ...identity, summary: "Done", requestId: "done-1" } })).isError).toBe(true);
  const completed = { ...identity, summary: "Fixed and checked.", verification: "Verified dark-mode contrast in browser.", requestId: "done-1" };
  expect((await client.callTool({ name: "complete_task", arguments: completed })).isError).not.toBe(true);
  await client.callTool({ name: "complete_task", arguments: completed });
  expect((await store.load("settings"))[0]).toMatchObject({ status: "completed", resolved: true });
  expect((await store.load("settings"))[0].comments).toHaveLength(3);
  expect((await client.callTool({ name: "list_comments", arguments: {} })).structuredContent).toMatchObject({ total: 0 });
  for (const status of ["resolved", "completed"]) expect((await client.callTool({ name: "list_comments", arguments: { status } })).structuredContent).toMatchObject({ total: 1 });
  expect((await client.callTool({ name: "complete_task", arguments: { ...completed, verification: "Different checks" } })).isError).toBe(true);
});
