# Remarq

Pin-and-comment feedback overlay for design prototypes and web apps. Let your team leave contextual feedback directly on the UI.

## Features

- **Click to pin** — drop comment pins anywhere on the page
- **Smart target detection** — auto-anchors to nearest meaningful element
- **Thread-based** — replies, resolve/unresolve, delete
- **Keyboard shortcut** — press `C` to toggle, `Esc` to cancel
- **Popover-aware** — comments inside modals/popovers re-appear when reopened
- **Pluggable storage** — localStorage, REST API, Next.js filesystem, or bring your own
- **All Pages view** — see every comment across your project in one sidebar
- **SSR-safe** — works with Next.js App Router

## Quick Start

### 1. Install

```bash
npm install -g remarq
```

### 2. Initialize in your project

```bash
cd [my-project]
remarq init
```

This will:
- Create `.remarq/` directory for comment storage
- Add `.remarq/` to `.gitignore`
- Detect Next.js and create `api/remarq/route.ts`
- Print setup instructions

### 3. Add to your layout

```tsx
// app/layout.tsx (or any layout wrapping your pages)
import { RemarqProvider, CommentOverlay, CommentToggle, CommentSidebar } from "remarq";

export default function Layout({ children }) {
  return (
    <RemarqProvider pageId="my-page">
      <div style={{ position: "relative" }}>
        {children}
        <CommentOverlay />
        <CommentSidebar />
        <CommentToggle />
      </div>
    </RemarqProvider>
  );
}
```

### 4. Start your dev server

```bash
npm run dev
```

Press `C` on any page to start commenting.

## CLI Commands

```bash
remarq init         # Set up remarq in this project
remarq remove       # Remove remarq from this project
remarq help         # Show help
```

### `remarq init`

| What it does | Details |
|---|---|
| Creates `.remarq/` | Comment storage directory |
| Updates `.gitignore` | Adds `.remarq/` (use `--keep-comments` to commit them) |
| Detects framework | Next.js auto-setup |
| Creates API route | `app/api/remarq/route.ts` for Next.js |

### `remarq remove`

Removes the API route. Optionally delete `.remarq/` and remove imports manually.

## How It Works

Comments are stored as JSON files in your project's `.remarq/` directory:

```
.remarq/
├── home.json
├── about.json
└── dashboard--settings.json
```

Each file contains an array of comment threads for that page. The `pageId` prop on `RemarqProvider` determines which file is used.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `C` | Toggle comment mode |
| `Escape` | Cancel unsaved comment / exit comment mode |
| `Enter` | Submit comment |

## Components

### `<RemarqProvider>`

Wraps your app. Manages state and persistence.

```tsx
<RemarqProvider
  pageId="unique-page-id"   // Which page's comments to load
  storage={adapter}          // Optional custom storage (default: /api/remarq)
>
```

### `<CommentOverlay>`

Transparent layer that captures clicks in comment mode. Renders pins and thread popovers. Auto-detects z-index to sit above popovers and modals.

### `<CommentToggle>`

Floating button (bottom-right). Shows unresolved comment count.

### `<CommentSidebar>`

Right panel with two tabs:
- **This Page** — comments on the current page
- **All Pages** — every comment across the project, grouped by page. Click to navigate.

## Hooks

```tsx
import { useRemarq, useComments, useCommentMode } from "remarq";

// Full context
const { threads, user, commentMode, addThread, addReply, resolveThread } = useRemarq();

// Thread operations
const { openThreads, resolvedThreads, unresolvedCount } = useComments();

// Toggle state
const { commentMode, toggleCommentMode, sidebarOpen, toggleSidebar } = useCommentMode();
```

## Storage Adapters

### Default (Next.js API route)

No config needed. Comments save to `.remarq/` via the API route created by `remarq init`.

### localStorage

For client-only storage (no server needed):

```tsx
import { localStorageAdapter } from "remarq/adapters/localStorage";

<RemarqProvider pageId="my-page" storage={localStorageAdapter}>
```

### Custom REST API

Point to any backend:

```tsx
import { createRestAdapter } from "remarq/adapters/rest";

<RemarqProvider pageId="my-page" storage={createRestAdapter("https://api.example.com/comments")}>
```

Your backend should implement:
- `GET ?pageId=xxx` → returns `RemarqThread[]`
- `POST ?pageId=xxx` with body `RemarqThread[]`

### Custom Adapter

```tsx
const myAdapter = {
  async load(pageId) { /* return threads */ },
  async save(pageId, threads) { /* persist threads */ },
};

<RemarqProvider pageId="my-page" storage={myAdapter}>
```

## Target Detection

When placing a comment, Remarq walks up the DOM to find the nearest meaningful container:

1. `data-comment-target="id"` — explicit anchor
2. Elements with `id` or `aria-label`
3. Semantic HTML (`section`, `nav`, `aside`, etc.)
4. Visual panels (scrollable, bordered, shadowed)

Pins are stored as percentages relative to the target, so they follow the element on scroll/resize. Pins inside popovers/modals automatically re-appear when the popover reopens.

## Debug Mode

Toggle debug logging from the browser console:

```js
__remarq_debug.enable()   // Enable verbose logging
__remarq_debug.disable()  // Disable
```

## Types

```tsx
type RemarqThread = {
  id: string;
  pageId: string;
  pinX: number;           // % position (0-100)
  pinY: number;
  targetId?: string;      // CSS selector for anchor element
  targetLabel?: string;   // Human-readable label
  resolved: boolean;
  comments: RemarqComment[];
  createdAt: string;
};

type RemarqStorage = {
  load(pageId: string): Promise<RemarqThread[]>;
  save(pageId: string, threads: RemarqThread[]): Promise<void>;
};
```

## Requirements

- React 18+
- Tailwind CSS
- lucide-react

## License

MIT
