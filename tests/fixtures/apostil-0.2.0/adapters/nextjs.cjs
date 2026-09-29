"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/adapters/nextjs.ts
var nextjs_exports = {};
__export(nextjs_exports, {
  GET: () => GET,
  POST: () => POST,
  createNextjsHandler: () => createNextjsHandler
});
module.exports = __toCommonJS(nextjs_exports);
function createNextjsHandler(directory = ".apostil") {
  return {
    async GET(request) {
      const { promises: fs } = await import("fs");
      const path = await import("path");
      const url = new URL(request.url);
      const pageId = url.searchParams.get("pageId");
      const dir = path.join(process.cwd(), directory);
      if (!pageId) {
        try {
          const files = await fs.readdir(dir);
          const pages = [];
          for (const file2 of files) {
            if (!file2.endsWith(".json")) continue;
            const id = file2.replace(".json", "");
            try {
              const data = await fs.readFile(path.join(dir, file2), "utf-8");
              const threads = JSON.parse(data);
              if (Array.isArray(threads) && threads.length > 0) {
                pages.push({ pageId: id, threads });
              }
            } catch {
            }
          }
          pages.sort((a, b) => {
            const aLatest = Math.max(...a.threads.map((t) => new Date(t.createdAt).getTime()));
            const bLatest = Math.max(...b.threads.map((t) => new Date(t.createdAt).getTime()));
            return bLatest - aLatest;
          });
          return Response.json(pages);
        } catch {
          return Response.json([]);
        }
      }
      const safeName = pageId.replace(/[^a-zA-Z0-9_-]/g, "");
      const file = path.join(dir, `${safeName}.json`);
      try {
        const data = await fs.readFile(file, "utf-8");
        return Response.json(JSON.parse(data));
      } catch {
        return Response.json([]);
      }
    },
    async POST(request) {
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
    }
  };
}
var defaultHandler = createNextjsHandler();
var GET = defaultHandler.GET;
var POST = defaultHandler.POST;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GET,
  POST,
  createNextjsHandler
});
//# sourceMappingURL=nextjs.cjs.map