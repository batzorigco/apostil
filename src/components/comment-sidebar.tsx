"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { MCPSettings } from "./mcp-settings";
import { SidebarIcon } from "./sidebar-icon";
import { CommentComposer } from "./comment-composer";
import { useApostil } from "../context";
import type { ApostilComment, ApostilThread } from "../types";
import { getTaskStatus } from "../task-status";
import { TaskStatusBadge, TaskStatusSelect, TaskUpdateDetails } from "./task-status";
import { ViewportPortal } from "./viewport-portal";
import { scrollToThread, threadLocationHint } from "../thread-navigation";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

type AllPagesData = { pageId: string; threads: ApostilThread[] }[];

export function CommentSidebar() {
  const { threads, pageId, mcpEndpoint, loadAllThreads, storageError, refreshThreads,
    sidebarOpen, setSidebarOpen, activeThreadId, setActiveThreadId, commentMode, brandColor } = useApostil();
  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"page" | "all">("page");
  const [allPages, setAllPages] = useState<AllPagesData>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const selectThread = (thread: ApostilThread) => {
    if (thread.pageId !== pageId) {
      let route = thread.pageId === "home" ? "/" : "/" + thread.pageId.replace(/--/g, "/");
      if (thread.context?.url) { try { route = new URL(thread.context.url).pathname; } catch { /* Legacy fallback. */ } }
      // Same path and no query means the host picks its page from state a link cannot reach; the hash waits for that page.
      if (route === window.location.pathname && !window.location.search) setLocationHint(`This comment is on “${thread.pageId}”. Switch to that view to open it.`);
      window.location.href = route + "#apostil-" + encodeURIComponent(thread.id);
      return;
    }
    if (activeThreadId === thread.id) {
      setActiveThreadId(null);
      setLocationHint("");
      return;
    }
    setActiveThreadId(thread.id);
    setLocationHint(scrollToThread(thread) ? "" : threadLocationHint(thread));
  };
  useEffect(() => { setLocationHint(""); }, [pageId, sidebarOpen]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, [sidebarOpen]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const menus = () => Array.from(ref.current?.querySelectorAll<HTMLDetailsElement>(".apostil-thread-actions[open]") ?? []);
    // Window capture runs before the overlay's document listeners, so a menu closes before its thread does.
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const open = menus();
      if (open.length) open.forEach(menu => { menu.open = false; menu.querySelector("summary")!.focus(); });
      else if (!activeThreadId && !commentMode && ref.current?.contains(document.activeElement)) setSidebarOpen(false);
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    const press = (e: PointerEvent) => menus().forEach(menu => { if (!menu.contains(e.target as Node)) menu.open = false; });
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", press, true);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("pointerdown", press, true); };
  }, [sidebarOpen, activeThreadId, commentMode, setSidebarOpen]);
  useEffect(() => {
    if (!sidebarOpen || tab !== "all") return;
    let cancelled = false;
    setLoadingAll(true); setLoadError(""); setAllPages([]);
    if (!loadAllThreads) { setLoadError("This storage adapter does not support all pages."); setLoadingAll(false); return; }
    loadAllThreads().then(pages => { if (!cancelled) setAllPages(pages); })
      .catch(error => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load comments."); })
      .finally(() => { if (!cancelled) setLoadingAll(false); });
    return () => { cancelled = true; };
  }, [sidebarOpen, tab, loadAllThreads, pageId]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshThreads();
      if (tab === "all" && loadAllThreads) { setAllPages(await loadAllThreads()); setLoadError(""); }
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Could not refresh comments."); }
    finally { setRefreshing(false); }
  };
  const pages = [...allPages.filter(page => page.pageId !== pageId), { pageId, threads }].filter(page => page.threads.length);
  const openCount = threads.filter(t => !t.resolved).length;
  const groups = [
    { label: "Needs review", threads: threads.filter(t => getTaskStatus(t) === "needs_review") },
    { label: "Open", threads: threads.filter(t => getTaskStatus(t) === "open") },
    { label: "Completed", threads: threads.filter(t => getTaskStatus(t) === "completed") },
  ];
  return <ViewportPortal>
    <div ref={ref} data-apostil-ui="sidebar" role="complementary" aria-label="Comments" tabIndex={-1} hidden={!sidebarOpen} style={{ zIndex: 2147483642, ...(!sidebarOpen ? { display: "none" } : {}) }}>
      <div className="apostil-sidebar-header">
        <SidebarIcon name="message" /><span>Comments</span>
        <button type="button" className="apostil-icon-button" title="Refresh comments" aria-label="Refresh comments" disabled={refreshing} onClick={() => void refresh()}><SidebarIcon name="refresh" /></button>
        <button type="button" className="apostil-icon-button" title="Close comments" aria-label="Close comments" onClick={() => setSidebarOpen(false)}><SidebarIcon name="close" /></button>
      </div>
      <div className="apostil-sidebar-tabs" role="tablist" aria-label="Comment scope" onKeyDown={e => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        setTab(tab === "page" ? "all" : "page");
        e.currentTarget.querySelector<HTMLElement>('[aria-selected="false"]')!.focus();
      }}>
        <button type="button" role="tab" aria-selected={tab === "page"} tabIndex={tab === "page" ? 0 : -1} onClick={() => setTab("page")} style={tab === "page" ? { color: brandColor, borderBottomColor: brandColor } : undefined}>
          <SidebarIcon name="file" />This Page{openCount > 0 && <span className="apostil-count">{openCount}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === "all"} tabIndex={tab === "all" ? 0 : -1} onClick={() => setTab("all")} style={tab === "all" ? { color: brandColor, borderBottomColor: brandColor } : undefined}><SidebarIcon name="globe" />All Pages</button>
      </div>
      <div className="apostil-sidebar-list" role="tabpanel" aria-label={tab === "page" ? "This Page" : "All Pages"}>
        {storageError && <p role="alert" className="apostil-sidebar-error">{storageError} Refresh to retry.</p>}
        {loadError && <p role="alert" className="apostil-sidebar-error">{loadError}</p>}
        {locationHint && <p role="status" className="apostil-sidebar-hint">{locationHint}</p>}
        {tab === "page" ? <>
          {!threads.length && <p className="apostil-sidebar-empty">No comments on this page.</p>}
          {groups.filter(group => group.threads.length).map(group => <ThreadGroup key={group.label} label={`${group.label} (${group.threads.length})`}>
            {group.threads.map(thread => <ThreadItem key={`${thread.pageId}:${thread.id}`} thread={thread} onSelect={() => selectThread(thread)} />)}
          </ThreadGroup>)}
        </> : loadingAll ? <p className="apostil-sidebar-empty">Loading...</p> : <>
          {!pages.length && !loadError && <p className="apostil-sidebar-empty">No comments in this project yet.</p>}
          {!!pages.length && <p className="apostil-sidebar-hint">{pages.reduce((sum, page) => sum + page.threads.filter(t => !t.resolved).length, 0)} open across {pages.length} pages</p>}
          {pages.map(page => <ThreadGroup key={page.pageId} label={page.pageId.replace(/--/g, "/")}>
            {[...page.threads].sort((a, b) => Number(a.resolved) - Number(b.resolved) || Number(getTaskStatus(b) === "needs_review") - Number(getTaskStatus(a) === "needs_review")).map(thread => <ThreadItem key={`${thread.pageId}:${thread.id}`} thread={thread} onSelect={() => selectThread(thread)} />)}
          </ThreadGroup>)}
        </>}
      </div>
      {sidebarOpen && <MCPSettings endpoint={mcpEndpoint} />}
    </div>
  </ViewportPortal>;
}

function ThreadGroup({ label, children }: { label: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  return <div className="apostil-thread-group">
    <button type="button" className="apostil-group-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <span className={expanded ? "" : "apostil-chevron-closed"}><SidebarIcon name="chevron" /></span>{label}
    </button>
    {expanded && children}
  </div>;
}

function readSeen(key: string): string[] {
  try { const saved = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(saved) && saved.every(id => typeof id === "string") ? saved : []; }
  catch { return []; }
}

function Author({ comment, children }: { comment: ApostilComment; children?: ReactNode }) {
  return <div className="apostil-comment-author">
    <span className="apostil-avatar" style={{ backgroundColor: comment.author.color }}>{comment.author.name[0]?.toUpperCase()}</span>
    <span className="apostil-author-name">{comment.author.name}</span>{children}<time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
  </div>;
}

function ThreadItem({ thread, onSelect }: { thread: ApostilThread; onSelect: () => void }) {
  const { pageId, activeThreadId, addReply, resolveThread, user, sidebarOpen } = useApostil();
  const local = thread.pageId === pageId;
  const expanded = local && activeThreadId === thread.id;
  const key = `apostil-seen:${JSON.stringify([thread.pageId, thread.id])}`;
  const [seen, setSeen] = useState(() => readSeen(key));
  useEffect(() => {
    if (!expanded || !sidebarOpen) return;
    const ids = thread.comments.slice(1).map(c => c.id);
    setSeen(ids);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Reading still works when browser storage is unavailable. */ }
  }, [expanded, sidebarOpen, thread.comments, key]);
  const first = thread.comments[0];
  if (!first) return null;
  const replies = thread.comments.slice(1);
  const unread = replies.filter(c => c.author.id !== user?.id && !seen.includes(c.id)).length;
  const replyCount = !expanded && unread ? unread : replies.length;
  const label = thread.targetLabel || thread.context?.anchor.label || thread.targetId || "Page";
  return <article className={`apostil-thread-card${expanded ? " is-expanded" : ""}`} tabIndex={0} aria-label={`Comment by ${first.author.name}`} onClick={onSelect}
    onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } }}>
    <div className="apostil-thread-messages">
      <div className="apostil-comment-message">
        <Author comment={first}>{getTaskStatus(thread) !== "open" && <TaskStatusBadge thread={thread} />}</Author>
        {local && <details className="apostil-thread-actions" onClick={e => e.stopPropagation()}>
          <summary aria-label="Task actions" title="Task actions">⋯</summary>
          <div><TaskStatusSelect thread={thread} /><button type="button" aria-label={thread.resolved ? "Reopen task" : "Complete task"} onClick={() => resolveThread(thread.id)}>{thread.resolved ? "Reopen task" : "Complete task"}</button></div>
        </details>}
        <div className="apostil-comment-bubble">
          <p>{first.body}</p><TaskUpdateDetails comment={first} />
          <div className="apostil-comment-meta">
            <span className="apostil-location" title={label}>In {label.startsWith("#") ? label : `#${label}`}</span>
            <button type="button" className={`apostil-replies${!expanded && unread ? " has-unread" : ""}`} aria-expanded={expanded} onClick={e => { e.stopPropagation(); onSelect(); }}>
              {replyCount ? `${replyCount}${!expanded && unread ? " new" : ""} ${replyCount === 1 ? "reply" : "replies"}` : "Reply"}
              <span className={expanded ? "apostil-chevron-up" : ""}><SidebarIcon name={!expanded && unread ? "chevron-unread" : expanded ? "chevron-expanded" : "chevron"} /></span>
            </button>
          </div>
        </div>
      </div>
      {expanded && replies.map(comment => <div className="apostil-comment-message" key={comment.id}>
        <Author comment={comment} /><div className="apostil-comment-bubble"><p>{comment.body}</p><TaskUpdateDetails comment={comment} /></div>
      </div>)}
    </div>
    {expanded && user && !thread.resolved && <div className="apostil-reply-row" onClick={e => e.stopPropagation()}><CommentComposer compact onSubmit={body => addReply(thread.id, body)} placeholder="Reply..." /></div>}
  </article>;
}
