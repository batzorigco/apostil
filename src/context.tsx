"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { RemarqThread, RemarqUser, RemarqStorage } from "./types";
import { createRestAdapter } from "./adapters/rest";
import { generateId, loadUser, saveUser, getRandomColor } from "./utils";
import { debug } from "./debug";

type RemarqContextValue = {
  threads: RemarqThread[];
  user: RemarqUser | null;
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

const RemarqContext = createContext<RemarqContextValue | null>(null);

export function RemarqProvider({
  pageId,
  storage,
  children,
}: {
  pageId: string;
  storage?: RemarqStorage;
  children: ReactNode;
}) {
  // Default: use the app's own /api/remarq route
  const adapter = storage ?? createRestAdapter("/api/remarq");
  const [threads, setThreads] = useState<RemarqThread[]>([]);
  const [user, setUserState] = useState<RemarqUser | null>(null);
  const [commentMode, setCommentMode] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = loadUser();
    if (saved) setUserState(saved);
  }, []);

  useEffect(() => {
    debug.log("loading threads for pageId:", pageId);
    adapter.load(pageId).then((t) => {
      debug.log("loaded", t.length, "threads");
      setThreads(t);
      setLoaded(true);
    });
  }, [pageId, adapter]);

  useEffect(() => {
    if (loaded) {
      debug.log("saving", threads.length, "threads for pageId:", pageId);
      adapter.save(pageId, threads);
    }
  }, [threads, pageId, adapter, loaded]);

  const setUser = useCallback((name: string) => {
    const u: RemarqUser = { id: generateId(), name, color: getRandomColor() };
    setUserState(u);
    saveUser(u);
  }, []);

  const addThread = useCallback(
    (pinX: number, pinY: number, body: string, targetId?: string, targetLabel?: string) => {
      if (!user) return;
      const threadId = generateId();
      const thread: RemarqThread = {
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
    <RemarqContext.Provider value={{
      threads, user, commentMode, activeThreadId, sidebarOpen,
      setCommentMode, setActiveThreadId, setSidebarOpen,
      addThread, addReply, resolveThread, deleteThread, setUser,
      unresolvedCount,
    }}>
      {children}
    </RemarqContext.Provider>
  );
}

export function useRemarq() {
  const ctx = useContext(RemarqContext);
  if (!ctx) throw new Error("useRemarq must be used within RemarqProvider");
  return ctx;
}
