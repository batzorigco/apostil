"use client";

import { MessageSquare, List, X } from "../icons";
import { useApostil } from "../context";

export function CommentToggle() {
  const {
    commentMode,
    setCommentMode,
    sidebarOpen,
    setSidebarOpen,
    unresolvedCount,
    setActiveThreadId,
    brandColor,
  } = useApostil();

  return (
    <div className="absolute bottom-5 right-5 z-[65] flex flex-col gap-2 items-end">
      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`flex items-center justify-center w-10 h-10 rounded-full shadow-lg
                    transition-all duration-200 hover:scale-105
                    ${sidebarOpen
                      ? "text-white"
                      : "bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-200"
                    }`}
        style={sidebarOpen ? { backgroundColor: brandColor } : undefined}
        title="Toggle comment list"
      >
        <List className="w-4 h-4" />
      </button>

      {/* Comment mode toggle */}
      <button
        onClick={() => {
          if (commentMode) {
            setCommentMode(false);
          } else {
            setActiveThreadId(null);
            setCommentMode(true);
          }
        }}
        className={`relative flex items-center justify-center w-12 h-12 rounded-full shadow-lg
                    transition-all duration-200 hover:scale-105
                    ${commentMode
                      ? "text-white ring-2 ring-neutral-400"
                      : "bg-white text-neutral-700 hover:bg-neutral-50 border border-neutral-200"
                    }`}
        style={commentMode ? { backgroundColor: brandColor } : undefined}
        title={commentMode ? "Exit comment mode" : "Add comment"}
      >
        {commentMode ? (
          <X className="w-5 h-5" />
        ) : (
          <MessageSquare className="w-5 h-5" />
        )}
        {/* Unresolved badge */}
        {unresolvedCount > 0 && !commentMode && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full
                           bg-red-500 text-white text-[10px] font-semibold
                           flex items-center justify-center px-1">
            {unresolvedCount}
          </span>
        )}
      </button>
    </div>
  );
}
