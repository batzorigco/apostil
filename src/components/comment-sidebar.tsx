"use client";

import { useState, useEffect } from "react";
import { X, Check, Undo2, MessageSquare, Globe, FileText } from "../icons";
import { MCPSettings } from "./mcp-settings";
import { CommentComposer } from "./comment-composer";
import { useApostil } from "../context";
import type { ApostilThread } from "../types";
import { getTaskStatus } from "../task-status";
import { TaskStatusBadge, TaskStatusSelect, TaskUpdateDetails } from "./task-status";
import { ViewportPortal } from "./viewport-portal";
import { scrollToThread, threadLocationHint } from "../thread-navigation";

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

function pageIdToDisplay(pageId: string): string {
  return pageId.replace(/--/g, "/").replace(/-/g, ".");
}

type AllPagesData = { pageId: string; threads: ApostilThread[] }[];

export function CommentSidebar() {
  const {
    threads,
    pageId, mcpEndpoint, loadAllThreads, storageError, refreshThreads,
    sidebarOpen,
    setSidebarOpen,
    setActiveThreadId,
    resolveThread,
    brandColor,
  } = useApostil();

  const [tab, setTab] = useState<"page" | "all">("page");
  const [allPages, setAllPages] = useState<AllPagesData>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [locationHint, setLocationHint] = useState("");

  const selectThread = (thread: ApostilThread) => {
    setActiveThreadId(thread.id);
    setLocationHint(scrollToThread(thread) ? "" : threadLocationHint(thread));
  };
  useEffect(() => { setLocationHint(""); }, [pageId, sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen || tab !== "all") return;
    let cancelled = false;
    setLoadingAll(true); setLoadError(""); setAllPages([]);
    if (!loadAllThreads) {
      setLoadError("This storage adapter does not support all pages.");
      setLoadingAll(false);
      return;
    }
    loadAllThreads().then(pages => { if (!cancelled) setAllPages(pages); })
      .catch(error => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load comments."); })
      .finally(() => { if (!cancelled) setLoadingAll(false); });
    return () => { cancelled = true; };
  }, [sidebarOpen, tab, loadAllThreads, pageId]);

  // Use the latest in-memory edits for this page, including unsaved replies and deletions.
  const pages = [...allPages.filter(page => page.pageId !== pageId), { pageId, threads }];

  const openThreads = threads.filter((t) => !t.resolved);
  const resolvedThreads = threads.filter((t) => t.resolved);

  return (
    <ViewportPortal>
      <div data-apostil-ui="sidebar" hidden={!sidebarOpen} style={{ zIndex: 2147483642, ...(!sidebarOpen ? { display: "none" } : {}) }} className="fixed top-0 right-0 bottom-0 w-80 bg-white border-l border-neutral-200 shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-neutral-500" />
            <span className="text-sm font-semibold text-neutral-900">
              Comments
            </span>
          </div>
          <button
            aria-label="Close comments"
            onClick={() => setSidebarOpen(false)}
            className="p-1 rounded hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        <div className="px-4 py-2 text-xs">
          <button type="button" className="underline text-neutral-600" onClick={() => void refreshThreads().then(async () => {
            if (tab === "all" && loadAllThreads) {
              try { setAllPages(await loadAllThreads()); setLoadError(""); }
              catch (error) { setLoadError(error instanceof Error ? error.message : "Could not refresh comments."); }
            }
          })}>Refresh comments</button>
          {storageError && <p role="alert" className="text-red-600">{storageError} Refresh to retry.</p>}
        </div>
        {/* Tabs */}
        <div className="flex border-b border-neutral-100">
          <button
            onClick={() => setTab("page")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              tab === "page"
                ? "border-b-2"
                : "text-neutral-400 hover:text-neutral-600"
            }`}
            style={tab === "page" ? { color: brandColor, borderColor: brandColor } : undefined}
          >
            <FileText className="w-3 h-3" />
            This Page
            {openThreads.length > 0 && (
              <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-px rounded-full">
                {openThreads.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("all")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              tab === "all"
                ? "border-b-2"
                : "text-neutral-400 hover:text-neutral-600"
            }`}
            style={tab === "all" ? { color: brandColor, borderColor: brandColor } : undefined}
          >
            <Globe className="w-3 h-3" />
            All Pages
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
          {locationHint && <p role="status" className="px-4 py-2 text-xs text-neutral-600">{locationHint}</p>}
          {tab === "all" && loadError && <p role="alert" className="p-4 text-xs text-red-600">{loadError}</p>}
          {tab === "page" ? (
            <PageThreads
              threads={threads}
              openThreads={openThreads}
              resolvedThreads={resolvedThreads}
              onSelect={id => { const thread = threads.find(t => t.id === id); if (thread) selectThread(thread); }}
              onResolve={resolveThread}
            />
          ) : (
            <AllPagesView
              pages={pages.filter(page => page.threads.length)}
              loading={loadingAll}
              currentPageId={pageId}
              onSelect={selectThread}
            />
          )}
        </div>
        {sidebarOpen && <MCPSettings endpoint={mcpEndpoint} />}
      </div>
    </ViewportPortal>
  );
}

// --- This Page tab ---

function PageThreads({
  threads,
  openThreads,
  resolvedThreads,
  onSelect,
  onResolve,
}: {
  threads: ApostilThread[];
  openThreads: ApostilThread[];
  resolvedThreads: ApostilThread[];
  onSelect: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  if (threads.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-neutral-400">
        No comments on this page.
      </div>
    );
  }

  const groups = [
    { label: "Needs review", threads: openThreads.filter(t => getTaskStatus(t) === "needs_review"), tone: "text-amber-800 bg-amber-50" },
    { label: "Open", threads: openThreads.filter(t => getTaskStatus(t) === "open"), tone: "text-neutral-500" },
    { label: "Completed", threads: resolvedThreads, tone: "text-emerald-700 bg-emerald-50" },
  ];
  return <>{groups.filter(group => group.threads.length).map(group => <div key={group.label}>
    <div className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wider ${group.tone}`}>
      {group.label} ({group.threads.length})
    </div>
    {group.threads.map(thread => <ThreadItem key={thread.id} thread={thread}
      onSelect={() => onSelect(thread.id)} onResolve={() => onResolve(thread.id)} resolved={thread.resolved} />)}
  </div>)}</>;

}

// --- All Pages tab ---

function AllPagesView({
  pages,
  loading,
  currentPageId,
  onSelect,
}: {
  pages: AllPagesData;
  loading: boolean;
  currentPageId: string;
  onSelect: (thread: ApostilThread) => void;
}) {
  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-neutral-400">
        Loading...
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-neutral-400">
        No comments in this project yet.
      </div>
    );
  }

  const totalOpen = pages.reduce((s, p) => s + p.threads.filter((t) => !t.resolved).length, 0);

  return (
    <>
      {totalOpen > 0 && (
        <div className="px-4 py-2 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
          {totalOpen} open across {pages.length} pages
        </div>
      )}

      {pages.map((page) => {
        const open = page.threads.filter((t) => !t.resolved).sort((a, b) => Number(getTaskStatus(b) === "needs_review") - Number(getTaskStatus(a) === "needs_review"));
        const resolved = page.threads.filter((t) => t.resolved);
        const displayName = pageIdToDisplay(page.pageId);

        return (
          <div key={page.pageId} className="border-b border-neutral-50">
            {/* Page header */}
            <div className="px-4 py-2.5 flex items-center justify-between bg-neutral-50/50">
              <span className="text-xs font-semibold text-neutral-700 truncate">
                {displayName}
              </span>
              <div className="flex items-center gap-1.5">
                {open.length > 0 && (
                  <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-px rounded-full font-medium">
                    {open.length}
                  </span>
                )}
                {resolved.length > 0 && (
                  <span className="text-[10px] bg-neutral-100 text-neutral-500 px-1.5 py-px rounded-full font-medium">
                    {resolved.length}
                  </span>
                )}
              </div>
            </div>

            {/* Threads for this page */}
            {[...open, ...resolved].map((thread) => {
              const firstComment = thread.comments[0];
              if (!firstComment) return null;
              const isResolved = thread.resolved;

              return (
                <div
                  key={thread.id}
                  onClick={() => {
                    if (page.pageId === currentPageId) { onSelect(thread); return; }
                    // Navigate to the page with the comment hash
                    let path = page.pageId === "home" ? "/" : "/" + page.pageId.replace(/--/g, "/");
                    if (thread.context?.url) {
                      try { path = new URL(thread.context.url).pathname; } catch { /* Legacy fallback. */ }
                    }
                    window.location.href = path + "#apostil-" + thread.id;
                  }}
                  className={`px-4 py-2.5 border-b border-neutral-50 cursor-pointer hover:bg-neutral-50 transition-colors ${
                    isResolved ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-semibold"
                        style={{ backgroundColor: firstComment.author.color }}
                      >
                        {firstComment.author.name[0]?.toUpperCase()}
                      </div>
                      <span className="text-xs font-medium text-neutral-700">
                        {firstComment.author.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400">
                      {timeAgo(firstComment.createdAt)}
                    </span>
                  </div>
                  <div className="pl-6 mb-2"><TaskStatusBadge thread={thread} /></div>
                  {!!thread.context?.surfaces.length && <p className="text-[10px] text-neutral-500 pl-6 mb-1">
        Open {thread.context.surfaces.map(surface => surface.element.label || surface.kind).join(" → ")} to view pin
      </p>}
      <p className="text-xs text-neutral-600 line-clamp-2 pl-6">
                    {firstComment.body}
                  </p>
                  {thread.comments.length > 1 && (
                    <span className="text-[10px] text-neutral-400 pl-6">
                      {thread.comments.length - 1} {thread.comments.length - 1 === 1 ? "reply" : "replies"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// --- Shared thread item ---

function ThreadItem({
  thread,
  onSelect,
  onResolve,
  resolved,
}: {
  thread: ApostilThread;
  onSelect: () => void;
  onResolve: () => void;
  resolved?: boolean;
}) {
  const { activeThreadId, addReply, user } = useApostil();
  const firstComment = thread.comments[0];
  if (!firstComment) return null;

  return (
    <div
      onClick={onSelect}
      className={`px-4 py-3 border-b border-neutral-50 cursor-pointer hover:bg-neutral-50 transition-colors
        ${getTaskStatus(thread) === "needs_review" ? "bg-amber-50/40" : ""}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-semibold"
            style={{ backgroundColor: firstComment.author.color }}
          >
            {firstComment.author.name[0]?.toUpperCase()}
          </div>
          <span className="text-xs font-medium text-neutral-700">
            {firstComment.author.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-neutral-400">
            {timeAgo(firstComment.createdAt)}
          </span>
          <button
            title={resolved ? "Reopen task" : "Complete task"}
            aria-label={resolved ? "Reopen task" : "Complete task"}
            onClick={(e) => {
              e.stopPropagation();
              onResolve();
            }}
            className="p-0.5 rounded hover:bg-neutral-200 transition-colors"
          >
            {resolved ? (
              <Undo2 className="w-3 h-3 text-neutral-400" />
            ) : (
              <Check className="w-3 h-3 text-emerald-600" />
            )}
          </button>
        </div>
      </div>
      <div className="pl-6 mb-2"><TaskStatusBadge thread={thread} /></div>
      {thread.targetLabel && (
        <span className="inline-block text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium ml-6 mb-1">
          {thread.targetLabel}
        </span>
      )}
      {!!thread.context?.surfaces.length && <p className="text-[10px] text-neutral-500 pl-6 mb-1">
        Open {thread.context.surfaces.map(surface => surface.element.label || surface.kind).join(" → ")} to view pin
      </p>}
      <p className="text-xs text-neutral-600 line-clamp-2 pl-6">
        {firstComment.body}
      </p>
      {activeThreadId === thread.id && <div className="mt-2 pl-6" onClick={e => e.stopPropagation()}>
        <TaskStatusSelect thread={thread} />
        {thread.comments.map(comment => <div key={comment.id} className="py-2 text-xs">
          <span className="font-medium">{comment.author.name}</span>
          <p className="whitespace-pre-wrap text-neutral-700">{comment.body}</p>
          <TaskUpdateDetails comment={comment} />
        </div>)}
        {user && !resolved && <CommentComposer onSubmit={body => addReply(thread.id, body)} placeholder="Reply..." />}
      </div>}
      {thread.comments.length > 1 && (
        <span className="text-[10px] text-neutral-400 pl-6">
          {thread.comments.length - 1} {thread.comments.length - 1 === 1 ? "reply" : "replies"}
        </span>
      )}
    </div>
  );
}
