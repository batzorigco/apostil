"use client";

import { useApostil } from "../context";

export function useCommentMode() {
  const { commentMode, setCommentMode, sidebarOpen, setSidebarOpen } = useApostil();

  return {
    commentMode,
    setCommentMode,
    toggleCommentMode: () => setCommentMode(!commentMode),
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar: () => setSidebarOpen(!sidebarOpen),
  };
}
