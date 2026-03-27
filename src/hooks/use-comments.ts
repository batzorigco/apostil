"use client";

import { useApostil } from "../context";

export function useComments() {
  const { threads, addThread, addReply, resolveThread, deleteThread, unresolvedCount } = useApostil();

  return {
    threads,
    openThreads: threads.filter((t) => !t.resolved),
    resolvedThreads: threads.filter((t) => t.resolved),
    addThread,
    addReply,
    resolveThread,
    deleteThread,
    unresolvedCount,
  };
}
