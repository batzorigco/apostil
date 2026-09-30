# Vite shared storage

By default a Vite app saves comments in the browser's local storage, where a coding agent cannot read them. This setup saves them as files in `.apostil/` instead, so MCP can use them.

It works with the local dev server only. A deployed Vite app needs its own storage backend or browser storage.

## Set up

1. Add `apostilStoragePlugin()` to the plugins in your existing `vite.config.ts`. Keep your other plugins and settings.

   ```ts
   import { defineConfig } from "vite";
   import react from "@vitejs/plugin-react";
   import { apostilStoragePlugin } from "apostil/adapters/vite";

   export default defineConfig({
     plugins: [react(), apostilStoragePlugin()],
   });
   ```

   To use a different folder: `apostilStoragePlugin({ directory: ".review-comments" })`.

2. In the generated `apostil-wrapper.tsx`, replace the `localStorageAdapter` import with:

   ```tsx
   import { createRestAdapter } from "apostil/adapters/rest";

   const storage = createRestAdapter("/api/apostil");
   ```

   Keep `storage` outside the component, and change the provider's `storage={localStorageAdapter}` to `storage={storage}`.

3. Restart Vite and open the app on `http://localhost`. New comments now save in `.apostil/`.

4. Connect your agent with `npx apostil mcp init`. See the [MCP guide](mcp.md).

## Import existing browser comments

Comments made before this setup are still in the browser. To copy them into the shared files:

1. Add this import to the wrapper file and render the button inside its provider.

   ```tsx
   import { importLocalComments } from "apostil/adapters/localStorage";

   <button onClick={async () => {
     await importLocalComments(storage);
     window.alert("Comments imported. Refresh the Apostil sidebar.");
   }}>
     Import browser comments
   </button>
   ```

2. Open the same browser and app address where you created those comments, and click the button once.
3. Remove the button and the import.

The import keeps the browser copies and is safe to repeat.
