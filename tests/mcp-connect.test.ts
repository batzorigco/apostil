// @vitest-environment node
import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { parse } from "smol-toml";
import { connectProject } from "../src/mcp/connect";

let project: string;
const cli = path.resolve("bin/apostil.js");
beforeEach(async () => { project = await fs.mkdtemp(path.join(os.tmpdir(), "apostil-config-")); });
afterEach(async () => { await fs.rm(project, { recursive: true, force: true }); });
it("adds Claude project config, preserves other servers and is idempotent", async () => {
  const original = { otherSetting: true, mcpServers: { existing: { command: "existing" } } };
  const file = path.join(project, ".mcp.json");
  await fs.writeFile(file, JSON.stringify(original));
  await connectProject({ project, client: "claude", cliPath: cli });
  const config = JSON.parse(await fs.readFile(file, "utf8"));
  expect(config.otherSetting).toBe(true);
  expect(config.mcpServers.existing.command).toBe("existing");
  expect(config.mcpServers.apostil.args).toContain(await fs.realpath(project));
  expect(config.mcpServers.apostil.args).toContain("mcp");
  expect((await connectProject({ project, client: "claude", cliPath: cli })).changed).toBe(false);
  expect(JSON.parse(await fs.readFile(`${file}.apostil-backup`, "utf8"))).toEqual(original);
});
it("preserves Codex TOML comments/settings and parses escaped project paths", async () => {
  project = await fs.rename(project, `${project} with spaces`).then(() => `${project} with spaces`);
  const directory = path.join(project, ".codex");
  await fs.mkdir(directory);
  const original = '# Keep this comment\nmodel = "existing-model"\n[mcp_servers.other]\ncommand = "other"\n';
  const filename = path.join(directory, "config.toml");
  await fs.writeFile(filename, original);
  const setup = await connectProject({ project, client: "codex", cliPath: cli, readOnly: true });
  expect(setup.content.startsWith(original)).toBe(true);
  const parsed = parse(setup.content) as any;
  expect(parsed.model).toBe("existing-model");
  expect(parsed.mcp_servers.apostil.args).toContain("--read-only");
  expect(parsed.mcp_servers.apostil.args).toContain(await fs.realpath(project));
  expect((await connectProject({ project, client: "codex", cliPath: cli, readOnly: true })).changed).toBe(false);
});
it("refuses to overwrite conflicting or invalid configuration", async () => {
  const filename = path.join(project, ".mcp.json");
  const original = '{"mcpServers":{"apostil":{"command":"custom"}}}';
  await fs.writeFile(filename, original);
  await expect(connectProject({ project, client: "claude", cliPath: cli })).rejects.toThrow("already exists");
  expect(await fs.readFile(filename, "utf8")).toBe(original);
  await fs.writeFile(filename, "invalid json");
  await expect(connectProject({ project, client: "claude", cliPath: cli })).rejects.toThrow();
  expect(await fs.readFile(filename, "utf8")).toBe("invalid json");
});
it("CLI dry-run writes nothing and reports invalid options on stderr", async () => {
  const preview = execFileSync(process.execPath, [cli, "connect", "codex", "--project", project, "--dry-run"], { encoding: "utf8" });
  expect(preview).toContain("[mcp_servers.apostil]");
  expect(await fs.readdir(project)).toEqual([]);
  expect(() => execFileSync(process.execPath, [cli, "mcp", "--unknown"], { stdio: "pipe" })).toThrow();
});

it.each(["claude", "codex"] as const)("migrates generated %s setup to HTTP and changes ports without duplicating servers", async client => {
  const initial = await connectProject({ project, client, cliPath: cli });
  const first = await connectProject({ project, client, url: "http://127.0.0.1:3846/mcp", updateGenerated: true });
  const second = await connectProject({ project, client, url: "http://127.0.0.1:3847/mcp", updateGenerated: true });
  const config = client === "claude" ? JSON.parse(second.content).mcpServers : (parse(second.content) as any).mcp_servers;
  expect(Object.keys(config)).toEqual(["apostil"]);
  expect(config.apostil.url).toBe("http://127.0.0.1:3847/mcp");
  expect(config.apostil.command).toBeUndefined();
  expect(await fs.readFile(`${first.filename}.apostil-backup`, "utf8")).toBe(initial.content);
});

it("does not replace a read-only connection with a writable HTTP server", async () => {
  const initial = await connectProject({ project, client: "codex", cliPath: cli, readOnly: true });
  await expect(connectProject({ project, client: "codex", url: "http://127.0.0.1:3846/mcp", updateGenerated: true })).rejects.toThrow("custom settings");
  expect(await fs.readFile(initial.filename, "utf8")).toBe(initial.content);
});
