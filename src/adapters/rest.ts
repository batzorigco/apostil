import type { ApostilStorage, ApostilThread } from "../types";

/**
 * REST API storage adapter.
 * Works with any backend that implements GET/POST for threads.
 */
export function createRestAdapter(baseUrl: string): ApostilStorage {
  return {
    async load(pageId: string): Promise<ApostilThread[]> {
      const url = `${baseUrl}?pageId=${encodeURIComponent(pageId)}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[apostil] load failed: ${res.status} ${res.statusText} — ${url}`);
          return [];
        }
        const data = await res.json();
        return data;
      } catch (e) {
        console.warn(`[apostil] load error:`, e, `— ${url}`);
        return [];
      }
    },

    async save(pageId: string, threads: ApostilThread[]): Promise<void> {
      const url = `${baseUrl}?pageId=${encodeURIComponent(pageId)}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(threads),
        });
        if (!res.ok) {
          console.warn(`[apostil] save failed: ${res.status} ${res.statusText} — ${url}`);
        }
      } catch (e) {
        console.warn(`[apostil] save error:`, e, `— ${url}`);
      }
    },
  };
}
