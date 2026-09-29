"use client";

import type { ApostilComment, ApostilThread, ApostilTaskStatus } from "../types";
import { getTaskStatus, taskStatusLabels } from "../task-status";
import { useApostil } from "../context";

const tones = {
  open: "bg-neutral-100 text-neutral-600",
  needs_review: "bg-amber-50 text-amber-800",
  completed: "bg-emerald-50 text-emerald-700",
};

export function TaskStatusBadge({ thread }: { thread: ApostilThread }) {
  const status = getTaskStatus(thread);
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[status]}`}>
    <span aria-hidden="true">{status === "completed" ? "✓" : status === "needs_review" ? "◉" : "○"}</span>
    {taskStatusLabels[status]}
  </span>;
}

export function TaskStatusSelect({ thread }: { thread: ApostilThread }) {
  const { setTaskStatus } = useApostil();
  return <label className="flex items-center justify-between gap-2 text-xs text-neutral-600">
    Task status
    <select aria-label="Task status" className="border border-neutral-200 rounded-lg px-2 py-1 bg-white"
      value={getTaskStatus(thread)} onChange={e => setTaskStatus(thread.id, e.target.value as ApostilTaskStatus)}>
      <option value="open">Open</option><option value="needs_review">Needs review</option><option value="completed">Completed</option>
    </select>
  </label>;
}

export function TaskUpdateDetails({ comment }: { comment: ApostilComment }) {
  if (!comment.taskUpdate) return null;
  return <div className={`mt-2 rounded-lg p-2 text-xs ${tones[comment.taskUpdate.status]}`}>
    <p className="font-semibold">{comment.taskUpdate.status === "completed" ? "Verification reported by AI" : "What to review"}</p>
    <p className="mt-1 whitespace-pre-wrap">{comment.taskUpdate.details}</p>
  </div>;
}
