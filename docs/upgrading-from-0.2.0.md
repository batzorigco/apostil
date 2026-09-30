# Upgrading from Apostil 0.2.0

The MCP/task-workflow changes are unreleased. Plan a new minor release (0.3.0):
existing public APIs remain supported, but storage and error behavior changes.

## What stays compatible

Existing imports, provider props, hooks, JSX usage, React >=18 peers, and custom
`load`/`save` adapters remain supported. Element context, task metadata, and
`loadAll` are optional. Browser storage retains `apostil-<pageId>` keys.

Existing JSON filenames remain supported, including `.apostil/.json` for `/` or
non-ASCII page IDs. IDs sharing a sanitized filename cannot safely share a file;
the stored page ID must match the request. All Pages uses stored page IDs and
still sorts newest threads first.

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

CLI/server adapters require Node **>=18.17**; React peers remain >=18. Checks ran
on Node 24, not every supported version. Use a maintained Node release.

MCP is optional and needs explicit setup. Import browser-only comments into
shared file storage before connecting; the MCP process cannot read localStorage.
See the [MCP setup instructions](../README.md#connect-your-existing-ai-with-mcp).

## Regression checks

`npm run test:compat` builds and checks public types, exports, and adapter behavior
against the checked-in published 0.2.0 fixture without downloading packages.
Run `npm run typecheck` and `npm test` for all checks.
