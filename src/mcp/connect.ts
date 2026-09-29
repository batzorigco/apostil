import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse as parseToml } from "smol-toml";

export type ConnectionOptions = {
  project: string;
  client: "claude" | "codex";
  cliPath: string;
  directory?: string;
  readOnly?: boolean;
  dryRun?: boolean;
};

/** Project-scoped only: preserve existing servers and never change trust/approval settings. */
export async function connectProject(options: ConnectionOptions) {
  const project = await fs.realpath(options.project);
  const command = process.execPath;
  const args = [await fs.realpath(options.cliPath), "mcp", "--project", project, "--author", options.client === "codex" ? "Codex" : "Claude"];
  if (options.directory) args.push("--directory", options.directory);
  if (options.readOnly) args.push("--read-only");
  const filename = options.client === "claude" ? path.join(project, ".mcp.json") : path.join(project, ".codex", "config.toml");
  if (options.client === "codex") {
    try { if ((await fs.lstat(path.dirname(filename))).isSymbolicLink()) throw new Error("Refusing to edit a symlinked .codex directory."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  let original = "";
  try {
    if ((await fs.lstat(filename)).isSymbolicLink()) throw new Error("Refusing to edit a symlinked MCP config.");
    original = await fs.readFile(filename, "utf8");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  let content: string;
  if (options.client === "claude") {
    const config = original ? JSON.parse(original) : {};
    if (!config || typeof config !== "object" || Array.isArray(config) ||
      (config.mcpServers !== undefined && (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)))) throw new Error("Invalid .mcp.json; it has not been changed.");
    const entry = { type: "stdio", command, args };
    const existing = config.mcpServers?.apostil;
    if (existing) {
      if (existing.command === command && JSON.stringify(existing.args) === JSON.stringify(args) && (!existing.type || existing.type === "stdio")) return { filename, content: original, changed: false };
      throw new Error("An Apostil MCP entry already exists with different settings. Review or remove that entry before reconnecting.");
    }
    config.mcpServers = { ...config.mcpServers, apostil: entry };
    content = JSON.stringify(config, null, 2) + "\n";
  } else {
    const config = parseToml(original);
    const servers = config.mcp_servers;
    if (servers !== undefined && (!servers || typeof servers !== "object" || Array.isArray(servers))) throw new Error("Invalid mcp_servers table; config.toml has not been changed.");
    const existing = (servers as Record<string, any> | undefined)?.apostil;
    if (existing) {
      if (existing.command === command && JSON.stringify(existing.args) === JSON.stringify(args)) return { filename, content: original, changed: false };
      throw new Error("An Apostil MCP entry already exists with different settings. Review or remove that entry before reconnecting.");
    }
    // Append a table rather than reserializing users' comments and formatting.
    content = `${original}${original.endsWith("\n") || !original ? "" : "\n"}\n[mcp_servers.apostil]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\n`;
    parseToml(content);
  }
  if (!options.dryRun) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    // Avoid overwriting an edit made while preparing the connection.
    const current = await fs.readFile(filename, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
    if (current !== original) throw new Error("MCP configuration changed during setup. Please retry.");
    if (original) await fs.writeFile(`${filename}.apostil-backup`, original, { flag: "wx", mode: 0o600 }).catch(error => { if (error.code !== "EEXIST") throw error; });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, content, { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, filename);
    } finally {
      await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  }
  return { filename, content, changed: true };
}
