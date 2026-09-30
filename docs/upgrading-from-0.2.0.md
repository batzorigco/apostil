# Upgrading from Apostil 0.2.0

0.3.0 adds MCP and the task workflow. Existing public APIs remain supported, but
storage and error behavior changes.

## Behavior changes at a glance

| Area | 0.2.0 | 0.3.0 |
| --- | --- | --- |
| Cross-site requests to the storage endpoint | Served | **403**. Same-origin only; proxies must forward `Host` or `X-Forwarded-Host` |
| POST without `Content-Type: application/json` | Accepted | **415** |
| REST load failure | Empty list | Rejects; the UI shows the error |
| Status change or delete from a 0.2.0 tab against a 0.3.0 server | Overwrote the file | **409**, file untouched |
| `list_comments` with `status: "open"` (the default) | n/a | Open threads only; use `needs_review`, `unfinished` or `all` for the rest |
| `apostil mcp init` | n/a | Offers to install the MCP packages and writes a portable `npx -y apostil mcp` entry |
| Page IDs whose file names collide | One file, later an error | Stored in separate files |
| Agent replies and status changes | n/a | Refresh automatically; manual refresh still available |
| Node | No `engines` declared | `>=20` |

The sections below give the detail. The endpoint is still unauthenticated; see
[Security](../README.md#security) before deploying it publicly.

## What stays compatible

Existing imports, provider props, hooks, JSX usage, React >=18 peers, and custom
`load`/`save` adapters remain supported. Element context, task metadata, and
`loadAll` are optional. Browser storage retains `apostil-<pageId>` keys.

Existing JSON filenames remain supported, including `.apostil/.json` for `/` or
non-ASCII page IDs. IDs sharing a sanitized filename no longer share a file or
fail: the existing file keeps its page, and each other page ID is stored in its
own file. All Pages uses stored page IDs and still sorts newest threads first.

## Upgrade the UI and server together

Back up your comment directory, deploy the updated UI, stylesheet and server,
and reload open tabs. Updated REST clients preserve concurrent replies and task
updates by submitting their edits alongside the version they originally loaded.

Legacy array-only clients can create threads, submit unchanged records, and add
replies when all current comments are included. The new server rejects missing
or changed saved replies, omitted threads, and status changes without a baseline
with **409**, leaving the file untouched. The 0.2.0 adapter only logs failures,
so old tabs can appear to save: upgrade/reload them before deleting or changing
statuses. An old server retains its overwrite behavior even with a new browser.

Custom REST clients should GET first, check `X-Apostil-Storage: merge-v1`, then
POST `{ threads: editedThreads, base: originallyLoadedThreads }`. Keep the base
unchanged during editing; after success use the submitted threads as the base
or GET again. The built-in REST adapter handles this protocol.

The storage endpoint now answers cross-site requests with **403** and POSTs that
are not `application/json` with **415**. The built-in REST adapter already sends
JSON from the same origin. Custom clients, scripts and tests must send
`Content-Type: application/json`; a reverse proxy in front of the app must pass
the browser's `Host` (or set `X-Forwarded-Host`), otherwise every browser
request looks cross-site. Server-side callers that send no `Origin` header are
unaffected.

REST `load`/`save` failures now reject instead of returning an empty list or
silently accepting failed saves. The provider displays errors. Direct callers
must catch errors and offer retry; never save `[]` as a failed-load fallback.

## Custom storage and targets

- Custom adapters need optional `loadAll()` to enable All Pages. The sidebar no
  longer falls back to `/api/apostil` for a different storage adapter.
- Store files in a real project subdirectory. External paths, the project root,
  and symlinks are rejected. Point the app and MCP at the same directory.
- Page IDs must be nonempty and at most 512 characters; sanitized filenames
  remain subject to filesystem limits. Each page file must be valid thread JSON,
  at most 8 MB, with unique thread IDs and consistent page/comment identities.
  Corrupt files now report errors; repair from a backup instead of clearing them.
- Use unique `data-comment-target` values or selectors. Hidden, missing, or
  ambiguous targets keep their threads in the sidebar without misplaced pins.
  Manual anchors take precedence over selectors.

## Styling, runtime, and MCP

Comment UI uses portals. Put theme rules on `body` or `[data-apostil-ui]`;
selectors depending on app-wrapper ancestry no longer reach it. Import the
updated `apostil/styles.css` alongside the updated JavaScript.

CLI/server adapters declare Node **>=20** (0.2.0 declared no minimum); React
peers remain >=18. CI runs on Node 20, 22 and 24 and against React 18 and 19.
Node 18 is end of life and is not tested.

Comments now refresh automatically, so agent replies and status changes appear
without a reload; the sidebar's refresh button loads them immediately.

MCP is optional and needs explicit setup. Its packages (`@modelcontextprotocol/sdk`,
`zod`, `smol-toml`) are optional peer dependencies; `npx apostil mcp init` offers
to install them and writes a portable `npx -y apostil mcp` entry with no absolute
paths. If an earlier checkout wrote an entry with absolute paths, run `mcp init`
again to replace it. `list_comments`
with `status: "open"` (the default) returns strictly open threads; ask for
`needs_review`, `unfinished` (both), `completed` or `all` to see the others. Import browser-only comments into
shared file storage before connecting; the MCP process cannot read localStorage.
See the [MCP guide](mcp.md).

## Regression checks

`npm test` builds first. `npm run test:compat` builds and checks only public types, exports, and adapter behavior
against the checked-in published 0.2.0 fixture without downloading packages.
Run `npm run typecheck` and `npm test` for all checks.
