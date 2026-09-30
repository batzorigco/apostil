"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { ApostilThread, ApostilUser, ApostilStorage, ApostilCaptureContext, ApostilPage, ApostilTaskStatus } from "./types";
import { createRestAdapter } from "./adapters/rest";
import { generateId, loadUser, saveUser, getRandomColor } from "./utils";
import { debug } from "./debug";

// Stable default adapter (created once, not per render)
const defaultAdapter = createRestAdapter("/api/apostil");

type ApostilContextValue = {
  mcpEndpoint?: string;
  pageId: string;
  loaded: boolean;
  storageError: string | null;
  refreshThreads: () => Promise<void>;
  loadAllThreads?: () => Promise<ApostilPage[]>;
  threads: ApostilThread[];
  user: ApostilUser | null;
  commentMode: boolean;
  activeThreadId: string | null;
  sidebarOpen: boolean;
  brandColor: string;
  setCommentMode: (on: boolean) => void;
  setActiveThreadId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  addThread: (pinX: number, pinY: number, body: string, targetId?: string, targetLabel?: string, context?: ApostilCaptureContext) => void;
  addReply: (threadId: string, body: string) => void;
  resolveThread: (threadId: string) => void;
  setTaskStatus: (threadId: string, status: ApostilTaskStatus) => void;
  deleteThread: (threadId: string) => void;
  setUser: (name: string) => void;
  unresolvedCount: number;
};

const ApostilContext = createContext<ApostilContextValue | null>(null);

export function ApostilProvider({
  pageId,
  storage,
  brandColor = "#171717",
  children,
}: {
  pageId: string;
  storage?: ApostilStorage;
  brandColor?: string;
  children: ReactNode;
}) {
  const adapter = storage ?? defaultAdapter;
  const [threads, setThreads] = useState<ApostilThread[]>([]);
  const [user, setUserState] = useState<ApostilUser | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  // The array storage last confirmed. Any other array holds edits that still need saving.
  const savedRef = useRef(threads);
  const pullingRef = useRef(false);

  useEffect(() => {
    const saved = loadUser();
    if (saved) setUserState(saved);
  }, []);

  // Track current pageId to avoid saving stale data during transitions
  const pageIdRef = useRef(pageId);
  const loadedPageRef = useRef<string | null>(null);

  useEffect(() => {
    pageIdRef.current = pageId;
    let cancelled = false;
    loadedPageRef.current = null;
    setLoaded(false);
    setStorageError(null);
    setThreads([]);
    setActiveThreadId(null);
    setCommentMode(false);
    hadThreadsRef.current = false;
    deletedRef.current = [];
    restoredRef.current = false;
    debug.log("loading threads for pageId:", pageId);
    adapter.load(pageId).then((t) => {
      // Only apply if pageId hasn't changed during the fetch
      if (!cancelled && pageIdRef.current === pageId) {
        debug.log("loaded", t.length, "threads for", pageId);
        loadedPageRef.current = pageId;
        savedRef.current = t;
        setThreads(t);
        setLoaded(true);
      }
    }).catch((error) => { if (!cancelled) setStorageError(error instanceof Error ? error.message : "Could not load comments."); });
    return () => { cancelled = true; };
  }, [pageId, adapter]);

  // Track whether we've ever had threads on this page (to know if empty means "deleted all")
  const hadThreadsRef = useRef(false);
  const deletedRef = useRef<ApostilThread[]>([]);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!loaded || loadedPageRef.current !== pageId) return;
    // Save when there are threads, or when threads were cleared (deletion)
    if (threads.length === 0 && !hadThreadsRef.current) return;
    hadThreadsRef.current = threads.length > 0;
    debug.log("saving", threads.length, "threads for pageId:", pageId);
    // Deletes made after this snapshot belong to a later save.
    const later = (d: ApostilThread) => threads.some(t => t.id === d.id);
    void adapter.save(pageId, threads).then(() => {
      deletedRef.current = deletedRef.current.filter(later);
      if (pageIdRef.current !== pageId) return;
      savedRef.current = threads;
      // The save that puts a rejected delete back succeeds; keep the reason it was rejected on screen.
      if (restoredRef.current) restoredRef.current = false;
      else setStorageError(null);
    }).catch(error => {
      if (pageIdRef.current !== pageId) return;
      setStorageError(error instanceof Error ? error.message : "Could not save comments.");
      // A rejected delete is still in storage, so its pin must not stay hidden here.
      const restore = deletedRef.current.filter(d => !later(d));
      deletedRef.current = deletedRef.current.filter(later);
      if (!restore.length) return;
      restoredRef.current = true;
      setThreads(prev => [...prev, ...restore.filter(d => !prev.some(t => t.id === d.id))].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, pageId, loaded]);

  const pull = useCallback(async (quiet: boolean) => {
    if (quiet && pullingRef.current) return;
    pullingRef.current = true;
    const snapshot = threadsRef.current;
    const unsaved = loadedPageRef.current === pageId && snapshot !== savedRef.current;
    try {
      // Save pending edits first. A failed save must not be replaced by a fresh load.
      // Saving an already-stored snapshot could overwrite newer remote work on adapters that do not merge.
      if (unsaved) await adapter.save(pageId, snapshot);
      const next = await adapter.load(pageId);
      if (pageIdRef.current === pageId && threadsRef.current === snapshot) {
        loadedPageRef.current = pageId;
        // Unchanged data keeps its identity so an idle poll re-renders and re-saves nothing.
        const same = JSON.stringify(next) === JSON.stringify(snapshot);
        savedRef.current = same ? snapshot : next;
        if (!same) setThreads(next);
        setLoaded(true);
        // A background pull only clears an error it fixed, so a rejected delete's reason stays on screen.
        if (!quiet || unsaved) setStorageError(null);
      }
    } catch (error) { if (!quiet && pageIdRef.current === pageId) setStorageError(error instanceof Error ? error.message : "Could not refresh comments."); }
    finally { pullingRef.current = false; }
  }, [adapter, pageId]);
  const refreshThreads = useCallback(() => pull(false), [pull]);

  // Agents reply and change status out of band, so pull while the tab is in use.
  // A failed background pull stays silent: the UI was fine and the next one retries.
  useEffect(() => {
    if (!loaded) return;
    const refresh = () => { if (!document.hidden) void pull(true); };
    const timer = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, [loaded, pull]);

  const setUser = useCallback((name: string) => {
    const u: ApostilUser = { id: generateId(), name, color: getRandomColor() };
    setUserState(u);
    saveUser(u);
  }, []);

  const addThread = useCallback(
    (pinX: number, pinY: number, body: string, targetId?: string, targetLabel?: string, context?: ApostilCaptureContext) => {
      if (!user || !loaded) return;
      const threadId = generateId();
      const thread: ApostilThread = {
        id: threadId,
        pageId,
        pinX, pinY,
        targetId, targetLabel, context,
        resolved: false,
        createdAt: new Date().toISOString(),
        comments: [{
          id: generateId(), threadId, author: user, body,
          createdAt: new Date().toISOString(),
        }],
      };
      debug.log("new thread:", { threadId, pinX, pinY, targetId, targetLabel, body });
      setThreads((prev) => [...prev, thread]);
      setActiveThreadId(threadId);
      setCommentMode(false);
    },
    [user, pageId, loaded]
  );

  const addReply = useCallback(
    (threadId: string, body: string) => {
      if (!user) return;
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? { ...t, comments: [...t.comments, { id: generateId(), threadId, author: user, body, createdAt: new Date().toISOString() }] }
            : t
        )
      );
    },
    [user]
  );

  const resolveThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, resolved: !t.resolved, status: t.resolved ? "open" : "completed" } : t));
    setActiveThreadId(null);
  }, []);

  const setTaskStatus = useCallback((threadId: string, status: ApostilTaskStatus) => {
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, status, resolved: status === "completed" } : t));
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    deletedRef.current.push(...threadsRef.current.filter((t) => t.id === threadId));
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setActiveThreadId(null);
  }, []);

  const loadAllThreads = useCallback(() => adapter.loadAll!(), [adapter]);

  const unresolvedCount = threads.filter((t) => !t.resolved).length;

  const value = useMemo(() => ({
    mcpEndpoint: adapter.mcpEndpoint,
    pageId, loaded, storageError, refreshThreads, loadAllThreads: adapter.loadAll ? loadAllThreads : undefined,
    threads, user, commentMode, activeThreadId, sidebarOpen, brandColor,
    setCommentMode, setActiveThreadId, setSidebarOpen,
    addThread, addReply, resolveThread, setTaskStatus, deleteThread, setUser,
    unresolvedCount,
  }), [adapter, pageId, loaded, storageError, refreshThreads, loadAllThreads, threads, user, commentMode, activeThreadId, sidebarOpen, brandColor,
    addThread, addReply, resolveThread, setTaskStatus, deleteThread, setUser, unresolvedCount]);

  return <ApostilContext.Provider value={value}>{children}</ApostilContext.Provider>;
}

export function useApostil() {
  const ctx = useContext(ApostilContext);
  if (!ctx) throw new Error("useApostil must be used within ApostilProvider");
  return ctx;
}
