import { CommentStore, validateThreads } from "./comment-store";

export function createStorageHandler(project: string, directory = ".apostil", mcp = false) {
  const store = new CommentStore(project, directory);
  const dev = mcp && process.env.NODE_ENV !== "production"
    ? import("../mcp/dev").then(({ getMCPDevController }) => getMCPDevController(project, directory)) : undefined;
  const mcpRequest = async (request: Request) => dev ? (await dev).handle(request) : new Response(null, { status: 404 });
  const headers = { "X-Apostil-Storage": "merge-v1", "Cache-Control": "no-store" };
  // Comments become agent tasks, so another website must not be able to read or plant them through the visitor's browser.
  // Origin is compared with the Host the browser asked for, not request.url, which a reverse proxy may rewrite.
  const crossSite = (request: Request) => {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    return request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && !(URL.canParse(origin) && new URL(origin).host === host));
  };
  const forbidden = () => Response.json({ error: "Same-origin requests only." }, { status: 403 });
  return {
    async GET(request: Request) {
      if (crossSite(request)) return forbidden();
      if (new URL(request.url).searchParams.has("mcp")) return mcpRequest(request);
      try {
        const pageId = new URL(request.url).searchParams.get("pageId");
        return Response.json(pageId ? await store.load(pageId) : await store.loadAll(), { headers });
      } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not read comments." }, { status: 500 }); }
    },
    async POST(request: Request) {
      if (crossSite(request)) return forbidden();
      if (new URL(request.url).searchParams.has("mcp")) return mcpRequest(request);
      // A JSON content type cannot be sent cross-site without a CORS preflight, which this handler never answers.
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "Send comments as application/json." }, { status: 415 });
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
