# MCP guide

How to connect a local coding agent to your Apostil comments. For the short version, see [Let a coding agent work through comments](../README.md#let-a-coding-agent-work-through-comments) in the README.

**Before you start**

- The agent must run in the same project as your app.
- MCP needs comments saved as files. Next.js does this out of the box; Vite needs the [shared storage setup](vite.md).
- MCP uses three packages that `npm install apostil` leaves out: `@modelcontextprotocol/sdk`, `zod` and `smol-toml`. `npx apostil mcp init` offers to install them.

## Set up from the terminal

Run from your app's project root:

```bash
npx apostil mcp init claude
# or
npx apostil mcp init codex
```

1. If the MCP packages are missing, the command asks before adding them as dev dependencies with your package manager.
2. It writes `.mcp.json` for Claude Code or `.codex/config.toml` for Codex.
3. Restart the client in this project and approve the Apostil server when asked.

The entry it writes runs `npx -y apostil mcp` with no absolute paths, so it can be committed and shared with a team. The AI client starts the server itself from the project root.

| Option | Effect |
| --- | --- |
| `--yes` | Install missing MCP packages without asking |
| `--dry-run` | Print the config that would be written, and change nothing |
| `--read-only` | Let the agent read comments but not reply or change status |
| `--directory <path>` | Use a custom comment folder instead of `.apostil` |

`npx apostil init --mcp` runs the same setup at the end of first-time installation.

## Set up from the sidebar

This starts an HTTP MCP endpoint from your dev server instead of letting the client start one.

1. Start your app's dev server and open it on `localhost` or `127.0.0.1`.
2. Open the comments sidebar and expand **MCP**.
3. Choose a port (default **3846**) and click **Start MCP**.
4. Click **Set up Claude Code** or **Set up Codex**.
5. Restart that client in this project and approve the Apostil connection when asked.

Good to know:

- Settings are saved for the project, and MCP starts with the dev server.
- The panel lists connected clients and their last activity. **Running** does not mean an agent is working.
- To change ports: stop MCP, enter the new port, start it, and repeat the client setup.
- **Stop MCP** keeps it stopped on future dev-server starts.
- **Copy URL** gives the endpoint for other local MCP clients. It is not for remote or web-only agents.
- If the panel says the MCP packages are not installed, run `npx apostil mcp init`.

## Cursor, VS Code and Windsurf

`apostil mcp init` writes configs for Claude Code and Codex only. For other clients, install the MCP packages first:

```bash
npm install -D @modelcontextprotocol/sdk zod smol-toml
```

Then add the entry by hand and restart the client.

**Cursor**: `.cursor/mcp.json` in the project root.

```json
{
  "mcpServers": {
    "apostil": {
      "command": "npx",
      "args": ["-y", "apostil", "mcp", "--project", "${workspaceFolder}", "--author", "Cursor"]
    }
  }
}
```

**VS Code** (Copilot agent mode): `.vscode/mcp.json`. The top-level key is `servers`.

```json
{
  "servers": {
    "apostil": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "apostil", "mcp", "--project", "${workspaceFolder}", "--author", "Copilot"]
    }
  }
}
```

**Windsurf**: `~/.codeium/windsurf/mcp_config.json`. This file is global, so give the project path explicitly.

```json
{
  "mcpServers": {
    "apostil": {
      "command": "npx",
      "args": ["-y", "apostil", "mcp", "--project", "/absolute/path/to/your/app", "--author", "Windsurf"]
    }
  }
}
```

## Server options

These go in the `args` of a client entry, after `mcp`.

| Option | Effect |
| --- | --- |
| `--project <path>` | Project root. Defaults to the directory the client starts the server in |
| `--directory <path>` | Comment folder inside the project. Defaults to `.apostil` |
| `--author <name>` | Name shown on the agent's replies |
| `--read-only` | Remove the reply and status tools |

## Tools

| Tool | Purpose |
| --- | --- |
| `list_comments` | List threads. Open only by default; filter with `pageId` or `status` (`open`, `needs_review`, `unfinished`, `completed`, `all`) |
| `get_comment_context` | One thread with its captured element and page context |
| `reply_to_comment` | Post a reply. With `status: "needs_review"` and `reviewInstructions` it also requests review |
| `request_review` | Post a summary and set the thread to Needs review |
| `complete_task` | Post a summary and verification, and set the thread to Completed |

Every write takes a `requestId`. Retrying with the same ID and the same content is safe and does nothing the second time. Calling `request_review` on a Completed thread reopens it.

The workflow agents should follow is in the README under [For coding agents](../README.md#for-coding-agents).
