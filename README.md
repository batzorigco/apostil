# Apostil

Pin-and-comment feedback overlay for React & Next.js. Let your team leave contextual feedback directly on the UI.

## Features

- **Click to pin** — drop comment pins anywhere on the page
- **Smart target detection** — auto-anchors to nearest meaningful element
- **Thread-based** — replies, resolve/unresolve, delete
- **Keyboard shortcuts** — `C` to toggle comment mode, `Esc` to cancel
- **Popover-aware** — comments inside modals/popovers re-appear when reopened
- **All Pages view** — see every comment across your project in one sidebar
- **Auto z-index** — overlay detects highest z-index and sits above everything
- **SSR-safe** — works with Next.js App Router

## Quick Start

### 1. Install

```bash
npm install apostil        # or: pnpm add apostil / yarn add apostil
```

### 2. Initialize

```bash
npx apostil init           # or: pnpm exec apostil init
```

This will:
- Create `app/api/apostil/route.ts` — API route for comment storage
- Create `components/apostil-wrapper.tsx` — pre-configured wrapper component
- Create `.apostil/` directory and add it to `.gitignore`
- **Automatically wrap `{children}` in your root layout** with `<ApostilWrapper>`

### 3. Done

```bash
npm run dev
```

Press `C` on any page to start commenting. That's it.

## How It Works

Comments are stored as JSON files in `.apostil/`:

```
.apostil/
├── home.json
├── about.json
└── dashboard--settings.json
```

The wrapper auto-detects the current page from `usePathname()` and loads the corresponding comments. Every page in your app gets commenting automatically.

## Uninstall

```bash
npx apostil remove
npm uninstall apostil
```

`remove` cleans up everything — deletes the API route, wrapper component, `.apostil/` directory, removes the `<ApostilWrapper>` from your layout, and cleans `.gitignore`.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `C` | Toggle comment mode |
| `Escape` | Cancel unsaved comment / exit comment mode |
| `Enter` | Submit comment |

## Components

### `<ApostilProvider>`

Core context provider. Use directly for custom setups:

```tsx
<ApostilProvider pageId="my-page" storage={customAdapter}>
  {children}
  <CommentOverlay />
  <CommentToggle />
</ApostilProvider>
```

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
- Next.js (App Router)
- Tailwind CSS

## License

MIT
