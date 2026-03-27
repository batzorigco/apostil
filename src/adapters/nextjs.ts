/**
 * Next.js API route handler for apostil comment storage.
 * Stores comments as JSON files in the project's .apostil/ directory.
 *
 * Usage:
 *
 * // app/api/apostil/route.ts
 * export { GET, POST } from "apostil/adapters/nextjs";
 *
 * Or with custom directory:
 * import { createNextjsHandler } from "apostil/adapters/nextjs";
 * const { GET, POST } = createNextjsHandler(".my-comments");
 * export { GET, POST };
 */

export function createNextjsHandler(directory: string = ".apostil") {
  return {
    async GET(request: Request) {
      const { promises: fs } = await import("fs");
      const path = await import("path");

      const url = new URL(request.url);
      const pageId = url.searchParams.get("pageId");
      const dir = path.join(process.cwd(), directory);

      // If no pageId, return ALL comments across all pages
      if (!pageId) {
        try {
          const files = await fs.readdir(dir);
          const pages: { pageId: string; threads: unknown[] }[] = [];
          for (const file of files) {
            if (!file.endsWith(".json")) continue;
            const id = file.replace(".json", "");
            try {
              const data = await fs.readFile(path.join(dir, file), "utf-8");
              const threads = JSON.parse(data);
              if (Array.isArray(threads) && threads.length > 0) {
                pages.push({ pageId: id, threads });
              }
            } catch {}
          }
          pages.sort((a, b) => {
            const aLatest = Math.max(...(a.threads as Array<{ createdAt: string }>).map((t) => new Date(t.createdAt).getTime()));
            const bLatest = Math.max(...(b.threads as Array<{ createdAt: string }>).map((t) => new Date(t.createdAt).getTime()));
            return bLatest - aLatest;
          });
          return Response.json(pages);
        } catch {
          return Response.json([]);
        }
      }

      // Single page
      const safeName = pageId.replace(/[^a-zA-Z0-9_-]/g, "");
      const file = path.join(dir, `${safeName}.json`);
      try {
        const data = await fs.readFile(file, "utf-8");
        return Response.json(JSON.parse(data));
      } catch {
        return Response.json([]);
      }
    },

    async POST(request: Request) {
      const { promises: fs } = await import("fs");
      const path = await import("path");

      const url = new URL(request.url);
      const pageId = url.searchParams.get("pageId");
      if (!pageId) {
        return Response.json({ error: "Missing pageId" }, { status: 400 });
      }

      const dir = path.join(process.cwd(), directory);
      const safeName = pageId.replace(/[^a-zA-Z0-9_-]/g, "");
      const file = path.join(dir, `${safeName}.json`);

      try {
        await fs.mkdir(dir, { recursive: true });
        const threads = await request.json();
        await fs.writeFile(file, JSON.stringify(threads, null, 2), "utf-8");
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 500 });
      }
    },
  };
}

// Default handler with ".apostil" directory
const defaultHandler = createNextjsHandler();
export const GET = defaultHandler.GET;
export const POST = defaultHandler.POST;
