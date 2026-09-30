import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parse as parseToml } from "smol-toml";

export type ConnectionOptions = {
  project: string;
  client: "claude" | "codex";
  url?: string;
  updateGenerated?: boolean;
  directory?: string;
  readOnly?: boolean;
  dryRun?: boolean;
};

/** Project-scoped only: preserve existing servers and never change trust/approval settings. */
export async function connectProject(options: ConnectionOptions) {
  const project = await fs.realpath(options.project);
  // The entry is shared with a team and must survive Node upgrades and the npx cache, so it holds no absolute path.
  // Both clients start project servers from the project root, which `apostil mcp` uses as its default project.
  const command = "npx";
  if (options.url && !/^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(options.url)) throw new Error("Expected a localhost MCP URL.");
  const args = options.url ? [] : ["-y", "apostil", "mcp", "--author", options.client === "codex" ? "Codex" : "Claude"];
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
  const conflict = () => new Error("An Apostil MCP entry already exists with custom settings. Review or remove that entry before reconnecting.");
  // Entries written before 0.3.0 ran an absolute node and CLI path.
  const legacy = (entry: Record<string, any>) => /[/\\]bin[/\\]apostil\.js$/.test(entry.args[0] ?? "") && entry.args[1] === "mcp";
  const stdio = (entry: Record<string, any>) => Object.keys(entry).every(k => ["type", "command", "args"].includes(k)) && Array.isArray(entry.args) &&
    (legacy(entry) || (entry.command === command && entry.args.slice(0, 3).join(" ") === "-y apostil mcp"));
  const canUpdate = (entry: Record<string, any>) => options.url
    ? options.updateGenerated && (Object.keys(entry).every(k => ["type", "url"].includes(k)) && /^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(entry.url ?? "") || stdio(entry) && !entry.args.includes("--read-only"))
    // Reconnecting replaces a legacy generated entry with the portable one, but never changes its access.
    : stdio(entry) && legacy(entry) && entry.args.includes("--read-only") === !!options.readOnly;
  let content: string;
  if (options.client === "claude") {
    const config = original ? JSON.parse(original) : {};
    if (!config || typeof config !== "object" || Array.isArray(config) ||
      (config.mcpServers !== undefined && (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)))) throw new Error("Invalid .mcp.json; it has not been changed.");
    const entry = options.url ? { type: "http", url: options.url } : { type: "stdio", command, args };
    const existing = config.mcpServers?.apostil;
    if (existing) {
      if (options.url ? existing.url === options.url && existing.type === "http" : existing.command === command && JSON.stringify(existing.args) === JSON.stringify(args) && (!existing.type || existing.type === "stdio")) return { filename, content: original, changed: false };
      if (!canUpdate(existing)) throw conflict();
    }
    config.mcpServers = { ...config.mcpServers, apostil: entry };
    content = JSON.stringify(config, null, 2) + "\n";
  } else {
    const config = parseToml(original);
    const servers = config.mcp_servers;
    if (servers !== undefined && (!servers || typeof servers !== "object" || Array.isArray(servers))) throw new Error("Invalid mcp_servers table; config.toml has not been changed.");
    const existing = (servers as Record<string, any> | undefined)?.apostil;
    if (existing) {
      if (options.url ? existing.url === options.url : existing.command === command && JSON.stringify(existing.args) === JSON.stringify(args)) return { filename, content: original, changed: false };
      if (!canUpdate(existing)) throw conflict();
    }
    // Append a table rather than reserializing users' comments and formatting.
    const entry = options.url ? `url = ${JSON.stringify(options.url)}\n` : `command = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\n`;
    if (existing) {
      const previous = existing.url ? `url = ${JSON.stringify(existing.url)}\n` : `command = ${JSON.stringify(existing.command)}\nargs = ${JSON.stringify(existing.args)}\n`;
      const block = `[mcp_servers.apostil]\n${previous}`;
      if (!original.includes(block)) throw conflict();
      content = original.replace(block, `[mcp_servers.apostil]\n${entry}`);
    } else content = `${original}${original.endsWith("\n") || !original ? "" : "\n"}\n[mcp_servers.apostil]\n${entry}`;
    parseToml(content);
  }
  if (!options.dryRun) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    // Avoid overwriting an edit made while preparing the connection.
    const current = await fs.readFile(filename, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
    if (current !== original) throw new Error("MCP configuration changed during setup. Please retry.");
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
