import type { ApostilTaskStatus, ApostilThread } from "./types";

export function getTaskStatus(thread: ApostilThread): ApostilTaskStatus {
  return thread.resolved ? "completed" : thread.status === "needs_review" ? "needs_review" : "open";
}

export const taskStatusLabels: Record<ApostilTaskStatus, string> = {
  open: "Open", needs_review: "Needs review", completed: "Completed",
};
