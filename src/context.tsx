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
import type { ApostilThread, ApostilUser, ApostilStorage } from "./types";
import { createRestAdapter } from "./adapters/rest";
import { generateId, loadUser, saveUser, getRandomColor } from "./utils";
import { debug } from "./debug";

// Stable default adapter (created once, not per render)
const defaultAdapter = createRestAdapter("/api/apostil");

type ApostilContextValue = {
  threads: ApostilThread[];
  user: ApostilUser | null;
  commentMode: boolean;
  activeThreadId: string | null;
  sidebarOpen: boolean;
  setCommentMode: (on: boolean) => void;
  setActiveThreadId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  addThread: (pinX: number, pinY: number, body: string, targetId?: string, targetLabel?: string) => void;
  addReply: (threadId: string, body: string) => void;
  resolveThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  setUser: (name: string) => void;
  unresolvedCount: number;
};

const ApostilContext = createContext<ApostilContextValue | null>(null);

export function ApostilProvider({
  pageId,
  storage,
  children,
}: {
  pageId: string;
  storage?: ApostilStorage;
  children: ReactNode;
}) {
  const adapter = storage ?? defaultAdapter;
  const [threads, setThreads] = useState<ApostilThread[]>([]);
  const [user, setUserState] = useState<ApostilUser | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = loadUser();
    if (saved) setUserState(saved);
  }, []);

  // Track current pageId to avoid saving stale data during transitions
  const pageIdRef = useRef(pageId);

  useEffect(() => {
    pageIdRef.current = pageId;
    setLoaded(false);
    debug.log("loading threads for pageId:", pageId);
    adapter.load(pageId).then((t) => {
      // Only apply if pageId hasn't changed during the fetch
      if (pageIdRef.current === pageId) {
        debug.log("loaded", t.length, "threads for", pageId);
        setThreads(t);
        setLoaded(true);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  useEffect(() => {
    if (loaded && pageIdRef.current === pageId && threads.length > 0) {
      debug.log("saving", threads.length, "threads for pageId:", pageId);
      adapter.save(pageId, threads);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, pageId, loaded]);

  const setUser = useCallback((name: string) => {
    const u: ApostilUser = { id: generateId(), name, color: getRandomColor() };
    setUserState(u);
    saveUser(u);
  }, []);

  const addThread = useCallback(
    (pinX: number, pinY: number, body: string, targetId?: string, targetLabel?: string) => {
      if (!user) return;
      const threadId = generateId();
      const thread: ApostilThread = {
        id: threadId,
        pageId,
        pinX, pinY,
        targetId, targetLabel,
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
    [user, pageId]
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
    setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, resolved: !t.resolved } : t));
    setActiveThreadId(null);
  }, []);

  const deleteThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setActiveThreadId(null);
  }, []);

  const unresolvedCount = threads.filter((t) => !t.resolved).length;

  return (
    <ApostilContext.Provider value={{
      threads, user, commentMode, activeThreadId, sidebarOpen,
      setCommentMode, setActiveThreadId, setSidebarOpen,
      addThread, addReply, resolveThread, deleteThread, setUser,
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
