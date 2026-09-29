import { CommentStore, validateThreads } from "./comment-store";

export function createStorageHandler(project: string, directory = ".apostil") {
  const store = new CommentStore(project, directory);
  const headers = { "X-Apostil-Storage": "merge-v1", "Cache-Control": "no-store" };
  return {
    async GET(request: Request) {
      try {
        const pageId = new URL(request.url).searchParams.get("pageId");
        return Response.json(pageId ? await store.load(pageId) : await store.loadAll(), { headers });
      } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not read comments." }, { status: 500 }); }
    },
    async POST(request: Request) {
      const pageId = new URL(request.url).searchParams.get("pageId");
      if (!pageId) return Response.json({ error: "Missing pageId" }, { status: 400 });
      try {
        const body = await request.json();
        const incoming = Array.isArray(body) ? body : body.threads;
        const base = Array.isArray(body) ? undefined : body.base;
        validateThreads(incoming, pageId);
        if (base !== undefined) validateThreads(base, pageId);
        const threads = await store.save(pageId, incoming, base);
        return Response.json({ ok: true, threads }, { headers });
      } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save comments." }, { status: 409 }); }
    },
  };
}
