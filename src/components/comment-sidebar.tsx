"use client";

import { useState, useEffect } from "react";
import { X, Check, Undo2, MessageSquare, Globe, FileText } from "lucide-react";
import { useApostil } from "../context";
import type { ApostilThread } from "../types";

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
    sidebarOpen,
    setSidebarOpen,
    setActiveThreadId,
    resolveThread,
  } = useApostil();

  const [tab, setTab] = useState<"page" | "all">("page");
  const [allPages, setAllPages] = useState<AllPagesData>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  // Fetch all pages when "All Pages" tab is selected
  useEffect(() => {
    if (!sidebarOpen || tab !== "all") return;
    setLoadingAll(true);

    // Try CLI server first, then local API
    async function fetchAll() {
      // Fetch from the app's own API route (no pageId = returns all pages)
      try {
        const res = await fetch("/api/apostil");
        if (res.ok) {
          const data = await res.json();
          setAllPages(data);
        }
      } catch {}
      setLoadingAll(false);
    }
    fetchAll();
  }, [sidebarOpen, tab]);

  if (!sidebarOpen) return null;

  const openThreads = threads.filter((t) => !t.resolved);
  const resolvedThreads = threads.filter((t) => t.resolved);

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 z-[75] bg-white border-l border-neutral-200 shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-neutral-500" />
          <span className="text-sm font-semibold text-neutral-900">
            Comments
          </span>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-1 rounded hover:bg-neutral-100 transition-colors"
        >
          <X className="w-4 h-4 text-neutral-500" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-100">
        <button
          onClick={() => setTab("page")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            tab === "page"
              ? "text-neutral-900 border-b-2 border-neutral-900"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
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
              ? "text-neutral-900 border-b-2 border-neutral-900"
              : "text-neutral-400 hover:text-neutral-600"
          }`}
        >
          <Globe className="w-3 h-3" />
          All Pages
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "page" ? (
          <PageThreads
            threads={threads}
            openThreads={openThreads}
            resolvedThreads={resolvedThreads}
            onSelect={setActiveThreadId}
            onResolve={resolveThread}
          />
        ) : (
          <AllPagesView
            pages={allPages}
            loading={loadingAll}
          />
        )}
      </div>
    </div>
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

  return (
    <>
      {openThreads.length > 0 && (
        <div>
          <div className="px-4 py-2 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
            Open ({openThreads.length})
          </div>
          {openThreads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              onSelect={() => onSelect(thread.id)}
              onResolve={() => onResolve(thread.id)}
            />
          ))}
        </div>
      )}

      {resolvedThreads.length > 0 && (
        <div>
          <div className="px-4 py-2 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
            Resolved ({resolvedThreads.length})
          </div>
          {resolvedThreads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              onSelect={() => onSelect(thread.id)}
              onResolve={() => onResolve(thread.id)}
              resolved
            />
          ))}
        </div>
      )}
    </>
  );
}

// --- All Pages tab ---

function AllPagesView({
  pages,
  loading,
}: {
  pages: AllPagesData;
  loading: boolean;
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
        const open = page.threads.filter((t) => !t.resolved);
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
                    // Navigate to the page with the comment hash
                    const path = "/" + page.pageId.replace(/--/g, "/");
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
  thread: { id: string; targetLabel?: string; comments: { author: { name: string; color: string }; body: string; createdAt: string }[] };
  onSelect: () => void;
  onResolve: () => void;
  resolved?: boolean;
}) {
  const firstComment = thread.comments[0];
  if (!firstComment) return null;

  return (
    <div
      onClick={onSelect}
      className={`px-4 py-3 border-b border-neutral-50 cursor-pointer hover:bg-neutral-50 transition-colors
        ${resolved ? "opacity-60" : ""}`}
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
      {thread.targetLabel && (
        <span className="inline-block text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium ml-6 mb-1">
          {thread.targetLabel}
        </span>
      )}
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
}
