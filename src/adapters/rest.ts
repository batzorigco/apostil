import type { ApostilStorage, ApostilThread } from "../types";

/**
 * REST API storage adapter.
 * Works with any backend that implements GET/POST for threads.
 */
export function createRestAdapter(baseUrl: string): ApostilStorage {
  const baselines = new Map<string, ApostilThread[]>();
  const mergePages = new Set<string>();
  const writes = new Map<string, Promise<void>>();
  return {
    async loadAll() {
      await Promise.all(writes.values());
      const res = await fetch(baseUrl);
      if (!res.ok) throw new Error(`Could not load all comments (${res.status}).`);
      const pages = await res.json();
      if (!Array.isArray(pages) || !pages.every(p => typeof p.pageId === "string" && Array.isArray(p.threads))) throw new Error("Invalid all-pages response.");
      return pages;
    },
    async load(pageId: string): Promise<ApostilThread[]> {
      const url = `${baseUrl}?pageId=${encodeURIComponent(pageId)}`;
      try {
        await writes.get(pageId);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Could not load comments (${res.status}).`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Invalid comment response.");
        if (res.headers.get("X-Apostil-Storage") === "merge-v1") mergePages.add(pageId);
        baselines.set(pageId, data);
        return data;
      } catch (e) {
        throw e;
      }
    },

    async save(pageId: string, threads: ApostilThread[]): Promise<void> {
      const url = `${baseUrl}?pageId=${encodeURIComponent(pageId)}`;
      const save = async () => {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mergePages.has(pageId) ? { threads, base: baselines.get(pageId) ?? [] } : threads),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || `Could not save comments (${res.status}).`);
          } else {
            // This baseline is what the browser knows, not remote additions returned by the server.
            baselines.set(pageId, threads);
          }
        } catch (e) {
          throw e;
        }
      };
      const pending = (writes.get(pageId) ?? Promise.resolve()).catch(() => {}).then(save);
      writes.set(pageId, pending);
      try { await pending; }
      finally { if (writes.get(pageId) === pending) writes.delete(pageId); }
    },
  };
}
