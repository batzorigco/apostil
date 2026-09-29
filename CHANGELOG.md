# Changelog

All notable changes to this project will be documented in this file.

Format: [Semantic Versioning](https://semver.org/)

## [Unreleased]

### Compatibility
- Restore the original `CommentOverlay` JSX return type and loading of legacy
  punctuation-only/non-ASCII page IDs (including `/`).
- Restore newest-first ordering in All Pages.
- Reject ambiguous baseline-free status changes, deletions, and stale replies
  with HTTP 409 instead of overwriting newer reviewer or AI work. Upgrade the
  browser and server together before using status changes or deletion.
- Declare Node >=18.17 and document the intentional REST error, custom storage,
  file validation, target matching, and portal/CSS migration requirements.
- Add offline regression tests using the published npm 0.2.0 adapters and types.

See [Upgrading from 0.2.0](docs/upgrading-from-0.2.0.md). These changes have not
been published; the package version must be changed before release.

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
