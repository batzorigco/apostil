"use client";

import { getTaskStatus } from "../task-status";
import { useApostil } from "../context";

export function useComments() {
  const { threads, addThread, addReply, resolveThread, setTaskStatus, deleteThread, unresolvedCount, refreshThreads, storageError } = useApostil();

  return {
    threads,
    refreshThreads, storageError,
    openThreads: threads.filter((t) => !t.resolved),
    needsReviewThreads: threads.filter(t => getTaskStatus(t) === "needs_review"),
    resolvedThreads: threads.filter((t) => t.resolved),
    addThread,
    addReply,
    resolveThread,
    setTaskStatus,
    deleteThread,
    unresolvedCount,
  };
}
