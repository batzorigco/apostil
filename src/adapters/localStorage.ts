import type { ApostilStorage, ApostilThread } from "../types";

const STORAGE_PREFIX = "apostil-";

export const localStorageAdapter: ApostilStorage = {
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
