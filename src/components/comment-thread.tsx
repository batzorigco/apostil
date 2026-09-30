"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Check, Trash2, Undo2 } from "../icons";
import { useApostil } from "../context";
import { CommentComposer } from "./comment-composer";
import { TaskStatusBadge, TaskStatusSelect, TaskUpdateDetails } from "./task-status";
import { usePinPosition } from "./comment-pin";
import { usePopoverPosition } from "./popover-position";
import type { ApostilThread as ApostilThreadType } from "../types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ApostilThreadPopover({
  thread,
  overlayRef,
}: {
  thread: ApostilThreadType;
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  const { activeThreadId, sidebarOpen, setActiveThreadId, addReply, resolveThread, deleteThread, user } =
    useApostil();
  const ref = useRef<HTMLDivElement>(null);
  const isOpen = activeThreadId === thread.id;

  const pos = usePinPosition(thread, overlayRef, isOpen);
  const placement = usePopoverPosition(pos, overlayRef, ref, isOpen, sidebarOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-apostil-ui="sidebar"]')) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setActiveThreadId(null);
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [isOpen, setActiveThreadId]);

  if (!isOpen || !pos) return null;

  return (
    <div
      data-apostil-ui="thread"
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      ref={ref}
      className="absolute z-[70]"
      style={{
        left: placement?.left ?? pos.left,
        top: placement?.top ?? pos.top,
        visibility: placement ? "visible" : "hidden",
        width: "min(320px, calc(100vw - 24px))",
        maxWidth: placement?.maxWidth,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col" style={{ maxHeight: placement?.maxHeight ?? "calc(100dvh - 24px)", boxSizing: "border-box" }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-neutral-100 bg-neutral-50 shrink-0">
          <div className="flex flex-wrap min-w-0 items-center gap-2">
            <span className="text-xs font-medium text-neutral-500">
              {thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"}
            </span>
            {thread.targetLabel && (
              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium break-words min-w-0">
                {thread.targetLabel}
              </span>
            )}
            <TaskStatusBadge thread={thread} />
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => resolveThread(thread.id)}
              className="p-1 rounded hover:bg-neutral-200 transition-colors"
              title={thread.resolved ? "Reopen task" : "Complete task"}
            >
              {thread.resolved ? (
                <Undo2 className="w-3.5 h-3.5 text-neutral-500" />
              ) : (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              )}
            </button>
            <button
              onClick={() => deleteThread(thread.id)}
              className="p-1 rounded hover:bg-red-50 transition-colors"
              title="Delete thread"
            >
              <Trash2 className="w-3.5 h-3.5 text-neutral-400 hover:text-red-500" />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-neutral-100 shrink-0"><TaskStatusSelect thread={thread} /></div>
        {/* Comments */}
        <div data-apostil-ui="thread-messages" className="max-h-64 min-h-0 overflow-y-auto" style={{ overscrollBehavior: "contain", overflowWrap: "anywhere" }}>
          {thread.comments.map((comment) => (
            <div key={comment.id} className="px-4 py-3 border-b border-neutral-50 last:border-0">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold shrink-0"
                  style={{ backgroundColor: comment.author.color }}
                >
                  {comment.author.name[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-medium text-neutral-800">
                  {comment.author.name}
                </span>
                <span className="text-[10px] text-neutral-400 ml-auto">
                  {timeAgo(comment.createdAt)}
                </span>
              </div>
              <p className="text-sm text-neutral-700 leading-relaxed pl-7">
                {comment.body}
              </p>
              <div className="pl-7"><TaskUpdateDetails comment={comment} /></div>
            </div>
          ))}
        </div>

        {/* Reply */}
        {user && !thread.resolved && (
          <div className="px-3 py-2.5 border-t border-neutral-100 bg-neutral-50/50 shrink-0">
            <CommentComposer
              onSubmit={(body) => addReply(thread.id, body)}
              placeholder="Reply..."
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
}
