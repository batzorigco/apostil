import type { ApostilStorage, ApostilThread } from "../types";

const STORAGE_PREFIX = "apostil-";

export const localStorageAdapter: ApostilStorage = {
  async loadAll() {
    if (typeof window === "undefined") return [];
    const pages = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      try {
        const threads = JSON.parse(localStorage.getItem(key) ?? "null");
        const pageId = key.slice(STORAGE_PREFIX.length);
        if (Array.isArray(threads) && threads.length && threads.every(t => t.pageId === pageId && Array.isArray(t.comments))) pages.push({ pageId, threads });
      } catch { /* Ignore unrelated or corrupt entries. */ }
    }
    return pages;
  },
  async load(pageId: string): Promise<ApostilThread[]> {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${pageId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async save(pageId: string, threads: ApostilThread[]): Promise<void> {
    if (typeof window === "undefined") return;
    localStorage.setItem(`${STORAGE_PREFIX}${pageId}`, JSON.stringify(threads));
  },
};

/** Explicitly copy browser-only comments to a shared adapter; keep the local backup. */
export async function importLocalComments(storage: ApostilStorage): Promise<{ pages: number; threads: number }> {
  const pages = await localStorageAdapter.loadAll!();
  let count = 0;
  for (const page of pages) {
    const remote = await storage.load(page.pageId);
    const merged = remote.map(thread => {
      const local = page.threads.find(t => t.id === thread.id);
      return local ? { ...thread, comments: [...thread.comments, ...local.comments.filter(c => !thread.comments.some(r => r.id === c.id))] } : thread;
    });
    merged.push(...page.threads.filter(t => !remote.some(r => r.id === t.id)));
    await storage.save(page.pageId, merged);
    count += page.threads.length;
  }
  return { pages: pages.length, threads: count };
}
