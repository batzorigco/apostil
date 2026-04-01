# Apostil

Figma-like commenting tool for React. Leave comments directly on the Web App UI, and never miss a feedback. Works with Next.js and Vite.

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
