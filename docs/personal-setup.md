# Personal setup

Use Apostil for yourself in a shared repository without committing anything.

The default `npx apostil init` limits Apostil to development, but it still edits tracked files. Pick one of the two approaches below.

| Approach | Works with | Tracked files edited |
| --- | --- | --- |
| [Keep the edits uncommitted](#keep-the-edits-uncommitted) | Next.js and Vite | Yes, and you leave them unstaged |
| [Separate local files](#separate-local-files-vite) | Vite with a committed `vite.config.ts` and no `vite.config.js` | None |

For a team-wide setup, use the normal installation in the [README](../README.md#quick-start) and commit the integration instead.

## Keep the edits uncommitted

1. Install without changing the project's dependency files, then initialize:

   ```bash
   npm install --no-save --package-lock=false apostil
   npx apostil init
   ```

2. Add the generated files to `.git/info/exclude`. It works like `.gitignore` but stays local to your checkout. Include only paths created for Apostil:

   ```gitignore
   # Personal Apostil setup
   /.apostil/
   /components/apostil-wrapper.tsx
   /src/components/apostil-wrapper.tsx
   /app/api/apostil/
   /src/app/api/apostil/
   ```

   If MCP setup creates a new `.mcp.json` or `.codex/config.toml`, exclude that file too. If that config is already shared, keep only the added Apostil entry uncommitted.

3. Keep Apostil's edits to existing files local: the app layout or entry, the Vite config, and any `.gitignore` change made by `init`. Exclude rules do **not** hide edits to tracked files. Stage only your intended changes with VS Code's **Stage Selected Ranges** or `git add -p`; avoid **Stage All**.

4. Before committing, run `git diff --cached` to confirm no Apostil setup is included.

If a later dependency install removes Apostil, reinstall with the same `--no-save --package-lock=false` command.

## Separate local files (Vite)

This is a manual setup; `apostil init` does not generate it. It adds two untracked files and edits nothing that is tracked.

1. Create a local `vite.config.js` that imports the committed config and adds Apostil. Vite picks up `.js` before `.ts` unless the start command names a config.

   ```js
   // vite.config.js (local, untracked)
   import { defineConfig, mergeConfig } from "vite";
   import { apostilStoragePlugin } from "apostil/adapters/vite";
   import base from "./vite.config.ts";

   export default defineConfig(async (env) => {
     const config = typeof base === "function" ? await base(env) : base;
     // Builds and tests get the committed config unchanged.
     if (env.command !== "serve" || process.env.VITEST) return config;
     return mergeConfig(config, {
       plugins: [
         apostilStoragePlugin(),
         {
           name: "apostil-dev-entry",
           transformIndexHtml: () => [
             { tag: "script", attrs: { type: "module", src: "/apostil.dev.tsx" }, injectTo: "body" },
           ],
         },
       ],
     });
   });
   ```

   `apostilStoragePlugin({ directory: ".review-comments" })` changes the comment folder (default `.apostil`).

2. Create `apostil.dev.tsx` to mount Apostil:

   ```tsx
   // apostil.dev.tsx (local, untracked)
   import { createRoot } from "react-dom/client";
   import { ApostilProvider, CommentOverlay, CommentSidebar, CommentToggle } from "apostil";
   import { createRestAdapter } from "apostil/adapters/rest";
   import "apostil/styles.css";

   const storage = createRestAdapter("/api/apostil");

   createRoot(document.body.appendChild(document.createElement("div"))).render(
     <ApostilProvider pageId={window.location.pathname} storage={storage}>
       <CommentOverlay />
       <CommentSidebar />
       <CommentToggle />
     </ApostilProvider>,
   );
   ```

   This reads the page ID once. In an app with client-side routing, re-render with the new path when the route changes.

3. Add the new files and the comment directory to `.git/info/exclude`. For example, from a monorepo root:

   ```gitignore
   /packages/website/vite.config.js
   /packages/website/apostil.dev.tsx
   /packages/website/.apostil/
   ```

4. Connect MCP to the same project and comment directory (see the [MCP guide](mcp.md)). Keep any newly created client config excluded too.

5. Run `git status` to check for unintended tracked edits, then start your usual dev command. Confirm that production builds and tests still use the original config.

Notes:

- Exclude rules apply only to untracked files, so this cannot hide an existing shared `vite.config.js`.
- The config adds Apostil only for the dev server. Narrow the condition further if only one dev command should get it.
- Use a locally installed Apostil package, or aliases to a built Apostil checkout. With a checkout, rebuild it and restart MCP after updating it.
