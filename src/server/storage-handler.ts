import { AGENT_AUTHOR_PREFIX, CommentStore, validateThreads } from "./comment-store";

export function createStorageHandler(project: string, directory = ".apostil", mcp = false) {
  const store = new CommentStore(project, directory);
  // Loaded on the first MCP request: the MCP packages are optional peers and most apps never start the server.
  let dev: Promise<{ handle(request: Request): Promise<Response> }> | undefined;
  const mcpRequest = async (request: Request) => {
    if (!mcp || process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
    try { return await (await (dev ??= import("../mcp/dev").then(({ getMCPDevController }) => getMCPDevController(project, directory)))).handle(request); }
    catch (error) {
      if (!(error as NodeJS.ErrnoException).code?.endsWith("MODULE_NOT_FOUND")) throw error;
      dev = undefined;
      return Response.json({ error: "The MCP packages are not installed. Run: npx apostil mcp init" }, { status: 501 });
    }
  };
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
        if (pageId) return Response.json(await store.load(pageId), { headers });
        const skipped: string[] = [];
        const pages = await store.loadAll(skipped);
        if (skipped.length) console.warn(`[apostil] Skipped unreadable comment files: ${skipped.join("; ")}`);
        return Response.json(pages, { headers });
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
        // Only CommentStore.reply may create agent outcomes. A browser can echo the stored ones back, but any it adds are dropped.
        const stored = new Map((await store.load(pageId)).map(t => [t.id, t.comments]));
        const trusted = incoming.map(t => ({ ...t, comments: t.comments.filter(c =>
          !(c.taskUpdate || c.author.id.startsWith(AGENT_AUTHOR_PREFIX)) || stored.get(t.id)?.some(p => p.id === c.id)) }));
        const threads = await store.save(pageId, trusted, base);
        return Response.json({ ok: true, threads }, { headers });
      } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save comments." }, { status: 409 }); }
    },
  };
}
