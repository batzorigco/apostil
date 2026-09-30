// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { parse } from "smol-toml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { connectProject } from "../src/mcp/connect";

let project: string;
const cli = path.resolve("bin/apostil.js");
beforeEach(async () => { project = await fs.mkdtemp(path.join(os.tmpdir(), "apostil-config-")); });
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });
it("adds Claude project config, preserves other servers and is idempotent", async () => {
  const original = { otherSetting: true, mcpServers: { existing: { command: "existing" } } };
  const file = path.join(project, ".mcp.json");
  await fs.writeFile(file, JSON.stringify(original));
  await connectProject({ project, client: "claude" });
  const config = JSON.parse(await fs.readFile(file, "utf8"));
  expect(config.otherSetting).toBe(true);
  expect(config.mcpServers.existing.command).toBe("existing");
  expect(config.mcpServers.apostil).toEqual({ type: "stdio", command: "npx", args: ["-y", "apostil", "mcp", "--author", "Claude"] });
  expect((await connectProject({ project, client: "claude" })).changed).toBe(false);
  expect(await fs.readdir(project)).toEqual([".mcp.json"]);
});
it("preserves Codex TOML comments/settings and parses escaped project paths", async () => {
  project = await fs.rename(project, `${project} with spaces`).then(() => `${project} with spaces`);
  const directory = path.join(project, ".codex");
  await fs.mkdir(directory);
  const original = '# Keep this comment\nmodel = "existing-model"\n[mcp_servers.other]\ncommand = "other"\n';
  const filename = path.join(directory, "config.toml");
  await fs.writeFile(filename, original);
  const setup = await connectProject({ project, client: "codex", readOnly: true });
  expect(setup.content.startsWith(original)).toBe(true);
  const parsed = parse(setup.content) as any;
  expect(parsed.model).toBe("existing-model");
  expect(parsed.mcp_servers.apostil.args).toContain("--read-only");
  // Nothing machine-specific: the file can be committed and survives Node upgrades and the npx cache.
  expect(parsed.mcp_servers.apostil).toEqual({ command: "npx", args: ["-y", "apostil", "mcp", "--author", "Codex", "--read-only"] });
  expect(setup.content).not.toContain(project);
  expect((await connectProject({ project, client: "codex", readOnly: true })).changed).toBe(false);
});
it("refuses to overwrite conflicting or invalid configuration", async () => {
  const filename = path.join(project, ".mcp.json");
  const original = '{"mcpServers":{"apostil":{"command":"custom"}}}';
  await fs.writeFile(filename, original);
  await expect(connectProject({ project, client: "claude" })).rejects.toThrow("already exists");
  expect(await fs.readFile(filename, "utf8")).toBe(original);
  await fs.writeFile(filename, "invalid json");
  await expect(connectProject({ project, client: "claude" })).rejects.toThrow();
  expect(await fs.readFile(filename, "utf8")).toBe("invalid json");
});
it("CLI dry-run writes nothing and reports invalid options on stderr", async () => {
  const preview = execFileSync(process.execPath, [cli, "mcp", "init", "codex", "--project", project, "--dry-run"], { encoding: "utf8" });
  expect(preview).toContain("[mcp_servers.apostil]");
  expect(await fs.readdir(project)).toEqual([]);
  expect(() => execFileSync(process.execPath, [cli, "mcp", "--unknown"], { stdio: "pipe" })).toThrow();
});

it.each(["claude", "codex"] as const)("migrates generated %s setup to HTTP and changes ports without duplicating servers", async client => {
  const initial = await connectProject({ project, client });
  const first = await connectProject({ project, client, url: "http://127.0.0.1:3846/mcp", updateGenerated: true });
  const second = await connectProject({ project, client, url: "http://127.0.0.1:3847/mcp", updateGenerated: true });
  const config = client === "claude" ? JSON.parse(second.content).mcpServers : (parse(second.content) as any).mcp_servers;
  expect(Object.keys(config)).toEqual(["apostil"]);
  expect(config.apostil.url).toBe("http://127.0.0.1:3847/mcp");
  expect(config.apostil.command).toBeUndefined();
  expect(initial.content).toContain("npx");
  expect(await fs.readdir(path.dirname(first.filename))).toEqual([path.basename(first.filename)]);
});

it("does not replace a read-only connection with a writable HTTP server", async () => {
  const initial = await connectProject({ project, client: "codex", readOnly: true });
  await expect(connectProject({ project, client: "codex", url: "http://127.0.0.1:3846/mcp", updateGenerated: true })).rejects.toThrow("custom settings");
  expect(await fs.readFile(initial.filename, "utf8")).toBe(initial.content);
});

it.each(["claude", "codex"] as const)("replaces a generated 0.2.0 %s entry with the portable one without changing its access", async client => {
  const legacy = { command: "/old/node", args: ["/old/cache/node_modules/apostil/bin/apostil.js", "mcp", "--project", project, "--author", "Codex"] };
  const filename = path.join(project, client === "claude" ? ".mcp.json" : ".codex/config.toml");
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, client === "claude" ? JSON.stringify({ mcpServers: { apostil: legacy } }) : `[mcp_servers.apostil]\ncommand = ${JSON.stringify(legacy.command)}\nargs = ${JSON.stringify(legacy.args)}\n`);
  await expect(connectProject({ project, client, readOnly: true })).rejects.toThrow("custom settings");
  const { content } = await connectProject({ project, client });
  const entry = client === "claude" ? JSON.parse(content).mcpServers.apostil : (parse(content) as any).mcp_servers.apostil;
  expect(entry).toMatchObject({ command: "npx", args: ["-y", "apostil", "mcp", "--author", client === "claude" ? "Claude" : "Codex"] });
});

it("the portable entry starts a working server from the project root", async () => {
  const { args } = JSON.parse((await connectProject({ project, client: "claude", directory: "notes" })).content).mcpServers.apostil;
  expect(args.slice(0, 2)).toEqual(["-y", "apostil"]);
  // Stand in for npx by running the local CLI with the generated arguments; the project comes from cwd alone.
  const client = new Client({ name: "connect-test", version: "1" });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, ...args.slice(2)], cwd: project }));
    const resource = await client.readResource({ uri: "apostil://project" });
    expect(JSON.parse((resource.contents[0] as { text: string }).text)).toMatchObject({ directory: path.join(await fs.realpath(project), "notes") });
  } finally { await client.close(); }
});
