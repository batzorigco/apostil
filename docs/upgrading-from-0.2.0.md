# Upgrading from Apostil 0.2.0

The MCP/task-workflow changes are not yet a published npm release. This guide
describes the current branch. Plan a new minor release (0.3.0), rather than
publishing these observable changes as another 0.2.0 or calling them fully
backward compatible.

## What stays compatible

- Existing imports, provider props, hooks, React >=18 peers, and JSX usage work.
- The public `CommentOverlay` function retains its original JSX element return
  type; its internal portal still waits for the browser before mounting.
- Existing thread/comment/user records and custom `load`/`save` adapters work.
  Capture context, task metadata, and all-page loading are optional additions.
- Browser storage still uses `apostil-<pageId>` keys.
- Existing JSON filenames are retained, including `.apostil/.json` for page IDs
  such as `/` or IDs containing only non-ASCII characters. The actual page ID
  inside the file must match the requested page: different IDs sharing one
  sanitized filename cannot safely share a file.
- All Pages remains sorted by newest thread first. Page identity now comes from
  the saved records, rather than the sanitized filename.

## Upgrade the UI and server together

Back up `.apostil/` and any custom comment directory before upgrading. Deploy the
updated UI, stylesheet, and server handler together, then reload open tabs.

The updated REST adapter automatically uses the server's merge protocol after
loading a page. It sends the version of the comments the browser saw along with
its edits, so concurrent replies and AI task updates can be preserved.

Older clients send only an array. The new server still accepts initial creation,
unchanged records, and additive replies that include the current comments.
However, it returns **409** for:

- Missing or changed saved replies, including a newer AI outcome.
- A task-status change without a read baseline.
- Omitted saved threads (a deletion or a stale list).

Without a baseline, the server cannot distinguish an intentional status change
or deletion from stale state. These writes are rejected atomically; the file is
left untouched. The published 0.2.0 adapter only logs failures, so an old tab may
look as though it saved. Upgrade/reload that tab before changing statuses or
deleting comments. An old **server** still has its original overwrite behavior;
upgrading only the browser does not add the new server's conflict protection.

Custom REST clients should GET the page first, check `X-Apostil-Storage: merge-v1`,
then POST `{ threads: editedThreads, base: originallyLoadedThreads }`. Keep the
baseline unchanged while editing. Update it to the successfully submitted
threads after a successful save, or GET again to pick up concurrent additions.
Prefer the built-in REST adapter, which implements this protocol.

## Handle REST failures

`createRestAdapter().load()` and `.save()` now reject on failed requests, rather
than returning an empty list or silently accepting a failed save. This prevents
an outage from being treated as an empty page and overwriting real comments.
The built-in provider displays these errors. Direct callers should catch them:

```ts
try {
  const threads = await storage.load(pageId);
  // Only continue editing/saving after a successful load.
} catch (error) {
  // Show the error and offer retry. Do not save [] as a fallback.
}
```

## Custom storage and All Pages

Per-page `load`/`save` adapters continue to work. To enable All Pages, implement
the optional `loadAll(): Promise<{ pageId: string; threads: ApostilThread[] }[]>`.
The built-in REST and localStorage adapters already implement it.

The sidebar no longer silently fetches `/api/apostil` when a custom adapter is
configured. If your adapter relied on that old behavior, explicitly implement
`loadAll` using that endpoint. This keeps All Pages and Send to AI scoped to the
storage you selected.

## Check custom files and targets

- Put comments in a real subdirectory inside the project (for example
  `.apostil` or `packages/website/.apostil`). External directories, the project
  root itself, and symlinked directories/files are rejected. Copy existing data
  into the intended subdirectory and point the app and MCP at the same path.
- Page IDs must be nonempty and no longer than 512 characters. Filenames still
  use the original ASCII sanitization and remain subject to filesystem limits.
- Each page file must be valid thread JSON, at most 8 MB, with unique thread IDs
  and consistent page/comment identities. Corrupt files now produce an error
  rather than disappearing from All Pages. Repair from a backup; do not replace
  corrupt data with an empty array just to suppress the error.
- Use unique `data-comment-target` values or selectors. A hidden or ambiguous
  target leaves the feedback in the sidebar instead of showing its pin at a
  potentially wrong element. Manual anchors take precedence over selectors.

## CSS and runtime

The global comment UI now uses portals to escape transformed or clipped app
containers. Put font/theme rules on `body`, or scope global CSS to
`[data-apostil-ui]`; selectors depending on the old app-wrapper ancestry no
longer reach the portal content. Import the updated `apostil/styles.css` with
the updated JavaScript.

The package declares Node **>=18.17** for its CLI and server adapters (including
the Response APIs and MCP dependency). React/React DOM peers remain >=18.
Use a maintained Node release. The current checks ran on Node 24; this pass
does not certify every allowed Node or React version.

## Enabling AI is separate

Basic commenting does not require MCP. To let an agent see browser-only
localStorage comments, explicitly import them into shared file storage and
configure the MCP connection. Direct Send to AI also needs a configured
sender/server route. Installing the UI does not auto-connect to a chat.

## Regression checks

Run `npm run test:compat`. It builds the package, checks the public declarations
and export paths against the actual published 0.2.0 fixture, and exercises old
and new adapters together. Fixtures are checked in, so the tests do not download
packages. Run `npm run typecheck` and `npm test` for the complete local checks.
