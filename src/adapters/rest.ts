import type { RemarqStorage, RemarqThread } from "../types";

/**
 * REST API storage adapter.
 * Works with any backend that implements GET/POST for threads.
 */
export function createRestAdapter(baseUrl: string): RemarqStorage {
  return {
    async load(pageId: string): Promise<RemarqThread[]> {
      const url = `${baseUrl}?pageId=${encodeURIComponent(pageId)}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[remarq] load failed: ${res.status} ${res.statusText} — ${url}`);
          return [];
        }
        const data = await res.json();
        return data;
      } catch (e) {
        console.warn(`[remarq] load error:`, e, `— ${url}`);
        return [];
      }
    },

    async save(pageId: string, threads: RemarqThread[]): Promise<void> {
      const url = `${baseUrl}?pageId=${encodeURIComponent(pageId)}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(threads),
        });
        if (!res.ok) {
          console.warn(`[remarq] save failed: ${res.status} ${res.statusText} — ${url}`);
        }
      } catch (e) {
        console.warn(`[remarq] save error:`, e, `— ${url}`);
      }
    },
  };
}
