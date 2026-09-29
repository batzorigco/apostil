# Apostil

Figma-like commenting tool for React. Leave comments directly on the Web App UI, and never miss a feedback. Works with Next.js and Vite.

**Upgrading from 0.2.0?** The MCP/task-workflow changes on this branch are unreleased.
See the [upgrade guide](docs/upgrading-from-0.2.0.md) for mixed-version saves,
custom adapters, storage requirements, and CSS changes. The CLI/server adapters
require Node >=18.17; React/React DOM peers remain >=18.

## What can it do?

- **Smart target detection** — auto-anchors to nearest meaningful element
- **Project level view** — see every comment across your project in one sidebar, like Figma.
- **SSR-safe** — works with Next.js App Router and Vite + React
- **Ships its own CSS** — no Tailwind config needed in your project

## Quick Start Guide

**1. Install** with npm, pnpm, or yarn

```bash
npm install apostil
```
Or install globally 
```bash
npm install -g apostil        
```

**2. Initialize**

```bash
npx apostil init             # personal (default) — local dev only
npx apostil init --dev       # dev + staging environments
npx apostil init --public    # all environments including production
```

The CLI auto-detects your framework (Next.js or Vite) and sets up accordingly:

**Next.js** — creates API route for file-based storage, wrapper component, injects into root layout.

**Vite + React** — creates wrapper component with localStorage adapter, injects into `App.tsx` or `main.tsx`. Uses `react-router-dom` for page detection if available.

**3. Start your project and start commenting**

```bash
npm run dev
```

Press `C` on any page to start commenting. On your first comment, you'll be prompted to enter your name — this is stored locally and used for all future comments. Click anywhere to place a pin, type your comment, and press `Enter` to save.

## How It Works

Comments are stored as JSON files in `.apostil/`:

```
.apostil/
├── home.json
├── about.json
└── dashboard--settings.json
```

The wrapper auto-detects the current page from `usePathname()` and loads the corresponding comments. Every page in your app gets commenting automatically. Comments persist across page refreshes and dev server restarts.

Click a pin to open its thread — you can reply to existing comments or resolve the thread. Resolved threads stay accessible but are visually distinguished.

### Shareable Links

Apostil supports hash-based thread links. Append `#apostil-<threadId>` to any URL to deep-link directly to a comment thread. The sidebar's **All Pages** view uses this to navigate across pages and open the target thread automatically.

## Modes

| Mode | Active in | Comments in git | Env override |
|------|-----------|----------------|--------------|
| `(default)` | Local dev only | No | — |
| `--dev` | Dev + staging | No | `NEXT_PUBLIC_APOSTIL=true` to force on |
| `--public` | All environments | Yes | `NEXT_PUBLIC_APOSTIL=false` to disable |

Re-run `npx apostil init --dev` (or `--public`) to switch modes — it will regenerate the wrapper component.

## Uninstall

```bash
npx apostil remove
npm uninstall apostil
```

`remove` cleans up everything — deletes the API route, wrapper component, `.apostil/` directory, removes the `<ApostilWrapper>` from your layout, and cleans `.gitignore`.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `C` | Toggle comment mode (modifier keys like `Cmd+C` / `Ctrl+C` are not intercepted) |
| `Escape` | Cancel unsaved comment / exit comment mode |
| `Enter` | Submit comment |

## Components

### `<ApostilProvider>`

Core context provider. Use directly for custom setups. When not using `npx apostil init`, import the styles manually:

```tsx
import "apostil/styles.css";

<ApostilProvider pageId="my-page" storage={customAdapter} brandColor="#2563eb">
  {children}
  <CommentOverlay />
  <CommentToggle />
</ApostilProvider>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `pageId` | `string` | required | Current page identifier |
| `storage` | `ApostilStorage` | REST `/api/apostil` | Storage adapter |
| `brandColor` | `string` | `"#171717"` | Accent color for buttons, tabs, and UI elements |

### `<CommentOverlay>`

Captures clicks in comment mode. Auto-detects z-index to sit above popovers and modals.

### `<CommentToggle>`

Floating button (bottom-right) with unresolved count badge.

### `<CommentSidebar>`

Right panel with two tabs:
- **This Page** — comments on the current page
- **All Pages** — every comment across the project. Click to navigate.

## Hooks

```tsx
import { useApostil, useComments, useCommentMode } from "apostil";

const { threads, user, addThread, addReply, resolveThread } = useApostil();
const { openThreads, resolvedThreads, unresolvedCount } = useComments();
const { commentMode, toggleCommentMode, sidebarOpen, toggleSidebar } = useCommentMode();
```

## Storage Adapters

### Default (file-based)

No config needed. `npx apostil init` sets up the API route that reads/writes `.apostil/` JSON files.

### localStorage

```tsx
import { localStorageAdapter } from "apostil/adapters/localStorage";
<ApostilProvider pageId="my-page" storage={localStorageAdapter}>
```

### Custom REST API

```tsx
import { createRestAdapter } from "apostil/adapters/rest";
<ApostilProvider pageId="my-page" storage={createRestAdapter("/api/my-comments")}>
```

### Custom Adapter

```tsx
const myAdapter: ApostilStorage = {
  async load(pageId) { /* return threads */ },
  async save(pageId, threads) { /* persist */ },
};
```

## Target Detection

Apostil auto-detects meaningful elements when placing comments:

1. `data-comment-target="id"` — explicit anchor
2. Elements with `id` or `aria-label`
3. Semantic HTML (`section`, `nav`, `aside`)
4. Visual panels (scrollable, bordered, shadowed)

Pins are stored as percentages relative to the target — they follow on scroll/resize.

## Debug

```js
// Browser console
__apostil_debug.enable()
__apostil_debug.disable()
```

## Requirements

- React 18+
- Next.js (App Router) or Vite + React

## License

MIT

## Connect your existing AI with MCP

Apostil includes a local stdio MCP server. Claude Code or Codex starts it when loading the project, then reads your saved feedback through tools. Apostil does not need a separate model API key and does not start a new AI conversation in this workflow.

From your project root, run one of:

```bash
npx apostil connect codex
npx apostil connect claude
```

Or run `npx apostil connect` to choose interactively. Restart the AI client in the project and approve/trust the connection when its UI requests it. Then ask:

> Use Apostil to address my open UI comments. Inspect each thread's element and dialog context, make the changes, and reply with what you verified.

The sidebar's **Send to AI → Connected AI (MCP)** view prepares a request referencing the selected page's or project's threads. **Copy request** lets you paste it into your existing conversation. It does not claim to push a message into that conversation or start work automatically. Use **Refresh comments** to retrieve the AI's replies.

Setup creates a project entry in `.codex/config.toml` for Codex or `.mcp.json` for Claude Code. It preserves other servers and settings, backs up an existing config once, and refuses to replace a conflicting `apostil` entry. It uses the installed Node executable and Apostil CLI's absolute paths, so it does not download a package every time the AI connects. Rerun setup after relocating/reinstalling that package; review/remove an old Apostil entry if its paths changed. Keep these machine-specific entries local rather than copying them to another computer. Setup does not modify global settings or auto-approve tools.

```bash
npx apostil connect codex --dry-run       # preview without writing config
npx apostil connect claude --read-only   # omit the reply tool
npx apostil connect codex --directory .review-comments
npx apostil mcp --project /path/to/app   # stdio server, normally started by the AI client
```

Client-specific configuration is documented by [Codex](https://learn.chatgpt.com/docs/extend/mcp) and [Claude Code](https://code.claude.com/docs/en/mcp). This setup targets their local project workflows, not Claude web chats or remote cloud agents.

### MCP tools

| Tool | Purpose |
|------|---------|
| `list_comments` | Paginated summaries with task status; filter by page and open/needs_review/completed/all (`resolved` remains an alias) |
| `get_comment_context` | Complete thread, replies, clicked element, anchor, route, viewport and dialog/popover opening controls |
| `reply_to_comment` | Append an attributed AI reply; retry safely using the same `requestId` |
| `complete_task` | Complete a verified fix with `summary`, `verification`, and `requestId` |
| `request_review` | Mark Needs review with `summary`, `reviewInstructions`, and `requestId` |

The server also exposes `apostil://project` and an `address_comments` prompt. Every call reads current disk data. It never runs shell commands, edits application source, or deletes comments; the connected AI uses its own existing coding tools for implementation. Read-only mode omits all three write tools.

Tasks have three states: **Open**, **Needs review**, and **Completed**. Older `resolved` comments display as Completed. `list_comments` defaults to all unfinished tasks, including Needs review. Needs review stays visible as an amber pin and appears first in the sidebar. Completed tasks leave the page pins and remain available in the sidebar. Reviewers can change Task status or reopen a completed task. Click **Refresh comments** after the AI updates a task.

`complete_task` requires the agent to describe its actual verification. This records the agent’s report; the server does not independently verify code or UI. When visual judgment, unavailable checks, or a decision requires a human, use `request_review` with specific instructions instead. Each tool updates status and appends the outcome atomically. Reuse a request ID only for an identical retry; replaying an old completion does not close a task a human has since reopened. Stale browser saves preserve remote status updates.

After upgrading Apostil, restart the connected MCP server/client to discover the new tools; the connection command does not need rerunning if its paths have not changed.

### Shared storage

**Next.js:** the standard `apostil/adapters/nextjs` route and MCP both use `.apostil/`. Update the installed Apostil version so both use the shared store. The app server and AI must run against the same project directory. If you use a custom directory, pass it to both `createNextjsHandler()` and `apostil connect --directory`.

**Vite:** browser localStorage is not accessible to a local MCP process. Add shared file storage to your existing Vite config:

```ts
import { apostilStoragePlugin } from "apostil/adapters/vite";

export default defineConfig({
  plugins: [react(), apostilStoragePlugin()],
});
```

Then replace the wrapper's `localStorageAdapter` with a stable REST adapter:

```tsx
import { createRestAdapter } from "apostil/adapters/rest";

const storage = createRestAdapter("/api/apostil");
// Inside your wrapper:
<ApostilProvider pageId={pageId} storage={storage}>
  {/* app and Apostil components */}
</ApostilProvider>
```

Run Vite on HTTP localhost. The storage plugin serves `/api/apostil` in development, validates local same-origin access, and writes the same `.apostil/` files used by MCP. It does not expose MCP over HTTP or launch an AI CLI. It may coexist with `apostilAgentPlugin()` for the optional direct-run workflow.

To bring existing browser comments across, explicitly call this once from an app button:

```ts
import { importLocalComments } from "apostil/adapters/localStorage";
await importLocalComments(storage);
```

This merges threads/replies into shared storage, keeps the browser copies, and is safe to repeat. Refresh the sidebar afterward. Custom remote storage is not automatically visible to the local MCP server.

The shared store uses per-page locks and atomic file replacement. Updated REST clients merge against the state they loaded, preserving concurrent AI replies and other reviewers' new threads. A stale deletion of a changed thread is rejected for review. REST load/save failures now reject instead of silently returning an empty page or claiming success; the provider displays them in the sidebar and retains local edits. Custom code using the REST adapter should catch these errors.

During development of Apostil itself, build first and replace `npx apostil` with `node bin/apostil.js` to use this checkout before publishing it.

## Send feedback directly to Codex or Claude Code

Open the comment sidebar, choose **This Page** or **All Pages**, and click **Send to AI**. Select **New agent run**, choose an agent, review the payload, then send. Replies are included; resolved threads can be included as history. The response appears in the sidebar. Sending itself does not complete or delete comments. If the agent has the updated Apostil MCP connection, it can report completion or request review through those tools.

The built-in connector starts a new CLI run in your project using your already-installed, signed-in `codex` or `claude` command. It can edit project files. It does not attach to an existing desktop conversation. Normal CLI permissions still apply: blocked tool calls may need local CLI configuration. Use a custom sender to connect an existing agent session instead.

### Next.js local development

Create `app/api/apostil/ai/route.ts` (or `src/app/api/apostil/ai/route.ts`):

```ts
import { createLocalAgentHandler } from "apostil/adapters/agents";

export const runtime = "nodejs";
export const POST = createLocalAgentHandler();
```

Run your app's dev server on localhost. The provider sends to `/api/apostil/ai` by default. The local handler requires development mode and a same-origin localhost request; it is disabled in production. The server must run where the CLI and project files are available, with enough request time for the agent to finish (up to ten minutes).

### Vite local development

Add the server plugin to your existing Vite config:

```ts
import { defineConfig } from "vite";
import { apostilAgentPlugin } from "apostil/adapters/agents";

export default defineConfig({
  plugins: [/* existing plugins, */ apostilAgentPlugin()],
});
```

The plugin serves `/api/apostil/ai` on the Vite development server. It uses HTTP localhost; HTTPS development servers should use a custom authorized handler.

### Existing agent connection / custom backend

```tsx
import { createAISender } from "apostil";

<ApostilProvider
  pageId="settings"
  onSendToAI={createAISender("/api/my-agent")}
>
  {/* App and Apostil components */}
</ApostilProvider>
```

Or pass `onSendToAI={async request => ({ message: await yourAgent.send(request) })}`. Requests contain `version`, `requestId`, `provider` (`codex` or `claude`) and `prompt`; the sender returns `{ message: string }` when the agent responds, and throws on failure. The UI retains the request ID when retrying the same payload. **Start a new attempt** creates a new ID after a failure.

For a custom Node deployment, `createAgentHandler({ cwd, authorize, run })` requires your authorization function. Keep authentication, CLI credentials, the working directory and permissions on the server. The default runner serializes execution per handler and remembers the last 100 request IDs in memory; restarts clear that history. Multi-process or hosted integrations should supply their own durable job queue and deduplication. CLI output and errors are returned to the authorized reviewer.

The CLI interfaces used here are documented in [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) and [Claude Code programmatic usage](https://code.claude.com/docs/en/headless).

## Element context and transient UI

New comments capture the clicked element separately from its pin anchor: a unique selector, tag, ID, classes, readable text, selected accessibility attributes, route, viewport, scroll position and timestamp. Selectors prefer `data-comment-target`, test IDs, IDs and accessible labels; structural paths are marked as less reliable. Existing saved comments remain readable but cannot retroactively acquire this context.

Apostil captures enclosing dialogs, menus, listboxes, details and popovers in opening order, including portaled surfaces linked by `aria-controls`. Open the surface first, then press **C**. Comment placement intercepts the click so it does not activate the underlying control. Escape closes the comment editor before dismissing the host surface. Closed or missing targets hide their pins; their threads and replies remain available in the sidebar and AI payload.

For custom surfaces or stronger source mapping, add explicit hints:

```tsx
<button id="open-settings" aria-controls="settings-dialog">Settings</button>
<div
  id="settings-dialog"
  role="dialog"
  data-comment-surface="settings dialog"
  data-comment-trigger="#open-settings"
>
  <button
    data-comment-target="settings-save"
    data-comment-label="Save settings"
    data-comment-source="src/components/settings-dialog.tsx"
  >Save</button>
</div>
```

`data-comment-trigger` is a CSS selector for the opening control. `data-comment-source` is an optional source hint, not an automatically verified source location. The AI must verify the snapshot against the repository before editing. Unknown triggers are reported as missing context instead of replayed blindly.

Capture omits form values, query strings, URL fragments, arbitrary data attributes, and text inside `data-comment-private`. Rendered text, labels, comments and source hints are included, so review the payload before sending. Query-driven UI states may require extra reproduction notes in your comment. Cross-origin iframes, closed shadow roots, and arbitrary third-party focus managers are not automatically supported.

All-page loading now follows the configured storage adapter. Built-in REST and localStorage adapters implement `loadAll()`. Custom adapters can add `loadAll(): Promise<{ pageId: string; threads: ApostilThread[] }[]>`; without it, current-page delivery still works and all-page delivery is disabled with an explanation.

### Local interaction demo

After building, run `npx vite --config examples/review/vite.config.ts --host 127.0.0.1` in this repository and open `/examples/review/`. The demo exercises native dialogs, nested native popovers, shared file storage and the MCP handoff UI. Its import button can copy older browser comments into the shared store. Use `node bin/apostil.js connect codex` or `node bin/apostil.js connect claude` from this checkout to connect your AI. The optional direct-run endpoint is not enabled in this demo.

Open `/examples/review/task-status.html` for an isolated, in-memory demo of Open, Needs review, and Completed tasks. It uses sample feedback and never writes real project comments.
