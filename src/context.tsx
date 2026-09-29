"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { ApostilThread, ApostilUser, ApostilStorage, ApostilCaptureContext, ApostilPage, ApostilAISender, ApostilTaskStatus } from "./types";
import { createRestAdapter } from "./adapters/rest";
import { generateId, loadUser, saveUser, getRandomColor } from "./utils";
import { createAISender } from "./ai";
import { debug } from "./debug";

// Stable default adapter (created once, not per render)
const defaultAISender = createAISender("/api/apostil/ai");
const defaultAdapter = createRestAdapter("/api/apostil");

type ApostilContextValue = {
  pageId: string;
  loaded: boolean;
  storageError: string | null;
  refreshThreads: () => Promise<void>;
  loadAllThreads?: () => Promise<ApostilPage[]>;
  sendToAI: ApostilAISender;
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
  onSendToAI = defaultAISender,
  children,
}: {
  pageId: string;
  storage?: ApostilStorage;
  brandColor?: string;
  onSendToAI?: ApostilAISender;
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
    debug.log("loading threads for pageId:", pageId);
    adapter.load(pageId).then((t) => {
      // Only apply if pageId hasn't changed during the fetch
      if (!cancelled && pageIdRef.current === pageId) {
        debug.log("loaded", t.length, "threads for", pageId);
        loadedPageRef.current = pageId;
        setThreads(t);
        setLoaded(true);
      }
    }).catch((error) => { if (!cancelled) setStorageError(error instanceof Error ? error.message : "Could not load comments."); });
    return () => { cancelled = true; };
  }, [pageId, adapter]);

  // Track whether we've ever had threads on this page (to know if empty means "deleted all")
  const hadThreadsRef = useRef(false);

  useEffect(() => {
    if (!loaded || loadedPageRef.current !== pageId) return;
    // Save when there are threads, or when threads were cleared (deletion)
    if (threads.length > 0) {
      hadThreadsRef.current = true;
      debug.log("saving", threads.length, "threads for pageId:", pageId);
      void adapter.save(pageId, threads).then(() => {
        if (pageIdRef.current === pageId) setStorageError(null);
      }).catch(error => { if (pageIdRef.current === pageId) setStorageError(error instanceof Error ? error.message : "Could not save comments."); });
    } else if (hadThreadsRef.current) {
      debug.log("saving empty threads for pageId:", pageId);
      void adapter.save(pageId, threads).then(() => {
        if (pageIdRef.current === pageId) setStorageError(null);
      }).catch(error => { if (pageIdRef.current === pageId) setStorageError(error instanceof Error ? error.message : "Could not save comments."); });
      hadThreadsRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, pageId, loaded]);

  const refreshThreads = useCallback(async () => {
    const snapshot = threadsRef.current;
    try {
      // Save pending edits first. A failed save must not be replaced by a fresh load.
      if (loadedPageRef.current === pageId) await adapter.save(pageId, snapshot);
      const next = await adapter.load(pageId);
      if (pageIdRef.current === pageId && threadsRef.current === snapshot) {
        loadedPageRef.current = pageId;
        setThreads(next); setLoaded(true); setStorageError(null);
      }
    } catch (error) { if (pageIdRef.current === pageId) setStorageError(error instanceof Error ? error.message : "Could not refresh comments."); }
  }, [adapter, pageId]);

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
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setActiveThreadId(null);
  }, []);

  const loadAllThreads = useCallback(() => adapter.loadAll!(), [adapter]);

  const unresolvedCount = threads.filter((t) => !t.resolved).length;

  return (
    <ApostilContext.Provider value={{
      pageId, loaded, storageError, refreshThreads, loadAllThreads: adapter.loadAll ? loadAllThreads : undefined, sendToAI: onSendToAI,
      threads, user, commentMode, activeThreadId, sidebarOpen, brandColor,
      setCommentMode, setActiveThreadId, setSidebarOpen,
      addThread, addReply, resolveThread, setTaskStatus, deleteThread, setUser,
      unresolvedCount,
    }}>
      {children}
    </ApostilContext.Provider>
  );
}

export function useApostil() {
  const ctx = useContext(ApostilContext);
  if (!ctx) throw new Error("useApostil must be used within ApostilProvider");
  return ctx;
}
