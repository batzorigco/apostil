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
