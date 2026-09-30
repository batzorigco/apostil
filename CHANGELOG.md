# Changelog

All notable changes to this project will be documented in this file.

Format: [Semantic Versioning](https://semver.org/)

## [0.3.0] - 2026-09-30

Existing imports, props, hooks and custom `load`/`save` adapters keep working.
Storage and error behaviour changed; read
[Upgrading from 0.2.0](docs/upgrading-from-0.2.0.md) before updating an app
that already has comments.

### Added
- MCP server so a coding agent can work through comments: `list_comments`,
  `get_comment_context`, `reply_to_comment`, `request_review`, `complete_task`
  and an `address_comments` prompt
- `npx apostil mcp init claude|codex` offers to install the MCP packages and
  writes a portable project MCP entry (`npx -y apostil mcp`, no absolute
  paths); `npx apostil init --mcp` runs it during first-time setup;
  `npx apostil mcp` runs the stdio server (`--project`, `--directory`,
  `--read-only`, `--author`)
- MCP panel in the sidebar to start and stop a local HTTP MCP endpoint from the
  dev server and set up Claude Code or Codex
- Task status on every thread: Open, Needs review, Completed, with a distinct
  review pin and status controls in the thread and sidebar
- `apostil/adapters/vite`: `apostilStoragePlugin()` saves comments to
  `.apostil/` from the Vite dev server
- Element context captured with each comment (page path, title, selector, short
  visible text) so agents can find the target; `data-comment-private` excludes
  an element
- `importLocalComments()` to move browser-only comments into shared storage
- Optional `loadAll()` on storage adapters for the All Pages tab
- Deep links to a thread with `#apostil-<threadId>`
- `.d.cts` types for CommonJS consumers, `./package.json` export, `sideEffects`
- Offline regression tests against the published 0.2.0 types and adapters

### Changed
- Redesigned comment UI: pins, thread popover, composer, sidebar and toggle,
  rendered in portals, with mobile commenting
- Comments refresh automatically every 15 seconds and when the tab regains
  focus; the sidebar keeps a manual refresh button
- The storage endpoint answers cross-site requests with **403** and POSTs that
  are not `application/json` with **415**
- REST `load`/`save` errors now reject and are shown in the UI instead of
  degrading to an empty list
- The server rejects status changes, deletions and stale replies that arrive
  without a baseline with **409**. A 0.2.0 browser tab talking to a 0.3.0
  server hits this, so update UI and server together and reload open tabs
- `list_comments` with `status: "open"` (the default) returns strictly open
  threads; use `needs_review`, or the new `unfinished` for both
- `@modelcontextprotocol/sdk`, `zod` and `smol-toml` are optional peer
  dependencies, so an overlay-only install pulls in no MCP packages
- Page IDs whose sanitized file names collide are stored in separate files
  instead of failing
- Comment files are validated: inside a project subdirectory, at most 8 MB,
  unique thread IDs. A corrupt page file reports an error instead of loading as
  empty; All Pages and `list_comments` skip it with a warning
- The storage endpoint drops agent replies and task updates that a browser
  adds itself; only the MCP server can create them
- Hidden, missing or ambiguous targets keep their thread in the sidebar without
  a misplaced pin
- `engines.node` is declared as `>=20` (0.2.0 declared nothing). Node 18 is end
  of life and the test suite cannot run on it
- New runtime dependencies for the MCP server and CLI:
  `@modelcontextprotocol/sdk`, `zod`, `smol-toml`

### Fixed
- `"use client"` is now present in the CommonJS client builds as well as ESM
- The CLI's unused CommonJS build is no longer shipped

## [0.2.0] - 2026-04-02

### Added
- Vite + React support: `apostil init` detects the framework and sets up a
  localStorage wrapper

### Changed
- Removed dead code and noisy debug logs

## [0.1.7] - 2026-03-31

### Fixed
- Target detection, resolved pins staying visible, Escape not closing threads

## [0.1.6] - 2026-03-30

### Added
- `brandColor` prop

### Fixed
- Popovers stay inside the viewport; autofocus and persistence fixes

## [0.1.5] - 2026-03-30

### Changed
- Ship pre-compiled CSS so styles work without Tailwind in the consuming app

## [0.1.4] - 2026-03-30

### Changed
- Package description and keywords

## [0.1.3] - 2026-03-30

### Added
- CommonJS build alongside ESM

### Fixed
- Several UX bugs in the comment overlay

## [0.1.2] - 2026-03-27

### Added
- Init modes: `--dev`, `--public`, default personal
- Environment guards in generated wrapper component
- `NEXT_PUBLIC_APOSTIL` env var override for dev/public modes

## [0.1.1] - 2026-03-27

### Changed
- Replaced lucide-react with inline SVG icons — zero runtime dependencies
- Vitest test suite (31 tests) covering adapters and CLI
- GitHub Actions CI on push and PRs

## [0.1.0] - 2026-03-27

### Added
- Pin-and-comment overlay for React & Next.js
- Smart target detection (semantic HTML, ARIA, visual panels)
- Thread-based comments with replies, resolve/unresolve
- Keyboard shortcuts: `C` to toggle, `Escape` to cancel
- Comment sidebar with "This Page" and "All Pages" tabs
- Auto z-index detection for popovers and modals
- Storage adapters: localStorage, REST, Next.js file-based
- CLI: `npx apostil init` and `npx apostil remove`
- Auto-injection of `<ApostilWrapper>` into root layout
