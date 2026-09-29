# Compatibility audit against npm 0.2.0

Checked on 2026-09-29 against the actual published tarball, not a repository branch.

- npm latest: `apostil@0.2.0`
- Source: https://registry.npmjs.org/apostil/-/apostil-0.2.0.tgz
- Published SHA-1: `e72aef7f705ecb05b4ed6d60968960abcb2b22fa`
- Local package still declares `0.2.0`; the local changes are not in that published tarball.

**Verdict: the normal integration and data upgrade paths are compatible, but this is not a completely backward-compatible release.** No application source was changed as part of this audit.

## Verified compatible

- Every published package export path is retained, including ESM, CommonJS, declarations, and `apostil/styles.css`.
- Existing provider props, hooks, custom storage shape, and user/comment/thread types remain usable. New data fields and provider options are optional.
- Existing JSX usage compiles. Type-level comparison of published and local declaration files found only the `CommentOverlay` return exception described below.
- React and React DOM peer ranges remain `>=18`.
- Published and local REST clients each passed create/read/resolve/delete against both published and local Next.js handlers: four combinations tested with the actual built code.
- Old `.apostil` JSON without capture context or task status loads in the new handler. New records remain readable by the old handler. The `resolved` boolean still permits older clients to reopen a completed task.
- Published and local localStorage adapters round-trip old/new records using the same `apostil-` keys.
- Existing `init` and `remove` implementation remains unchanged; new CLI commands are additive.

## Compatibility exceptions

| Area | Observed change | Impact / action before release |
| --- | --- | --- |
| Mixed browser versions | A stale published client sends an array without a baseline. Tested: it can change an AI-completed task back to open on the new server. | Refresh old tabs when upgrading. Baseline-free writes cannot reliably distinguish an intentional edit from stale state. Consider explicitly detecting/rejecting conflicting legacy writes. |
| REST failures | Published `load` returned `[]` and `save` swallowed errors. Both now reject. | Built-in provider catches these errors; direct adapter callers need error handling. This is an intentional data-protection improvement, but an observable contract change. |
| Storage directories | New handler rejects the project root, paths outside the project, and symlinked directories/files. Old handler allowed these. | Custom storage layouts may need relocation. Preserve the safety checks and document migration. |
| Page IDs and files | IDs longer than 512 characters or with no ASCII letter/digit/underscore/dash are rejected. Files over 8 MB, invalid data, and sanitized-name collisions are rejected. | Standard generated IDs such as `home` work. Tested old `pageId="/"` storage is rejected after upgrade. Check custom IDs/data before migrating. |
| TypeScript return type | `CommentOverlay(): JSX.Element` became `ReactPortal \| null`. | Standard JSX is compatible; exact function-return assignments are not. A component wrapper returning JSX could preserve the original signature without an unsafe type cast. |
| Custom adapters / All Pages | Sidebar previously fetched `/api/apostil` directly; it now uses optional `storage.loadAll()`. | Custom adapters that depended on the implicit endpoint need `loadAll`; ordinary per-page load/save still works. |
| Legacy pin targets | Lookup now requires a unique, visible target and prioritizes `data-comment-target` over a selector with the same value. | Ambiguous legacy selectors can hide pins that previously attached to the first match; comments remain in storage/sidebar. Use unique anchors. |
| DOM and CSS overrides | Overlay, sidebar, and controls use portals; controls/sidebar are fixed to the viewport. | Ancestor-scoped CSS, inherited styles, DOM queries, or event assumptions tied to the old wrapper may change. The CSS import remains the same. Refresh CSS together with JS. |
| Runtime dependencies | Local package adds MCP SDK, TOML, and Zod dependencies; installed MCP SDK declares Node >=18. Apostil itself has no engines field. | Declare/document the supported Node version before publishing; do not assume unchanged React peer dependencies guarantee unchanged server requirements. |

The all-pages server response also changes ordering (file order instead of most recent first), uses each thread's actual page ID instead of its sanitized filename, and reports corrupt files rather than silently skipping them.

## AI setup is an additional upgrade step

Basic commenting does not require enabling MCP. Existing Vite localStorage comments still work, but MCP cannot see browser storage: shared storage and an explicit import are required. Direct Send to AI requires a configured sender/server route. Installing the updated UI alone does not connect an agent or detect an existing chat.

## Evidence and scope

- Ten runtime checks passed against downloaded published and local built adapters. Some checks deliberately assert the incompatibilities above; passing checks do not mean zero breaking changes.
- TypeScript strict declaration comparison confirmed the nullable overlay return exception; the remaining original API and original JSX provider usage compiled.
- All original export targets were checked for existence in the local build.
- Published source maps were compared with local source for provider behavior, CLI, pin targeting, sidebar behavior, and rendering.
- Existing 76 tests, typecheck, and build passed in the preceding fix; source was unchanged during this audit, so they were not rerun.
- This audit did not certify every React/Node/browser version, every custom backend, or Gaia's installed copy.

Before publishing, resolve or explicitly document these exceptions, add permanent compatibility regression coverage, and assign a new version (a `0.3.0` release would communicate the scope better than a patch). Nothing was published by this audit.
