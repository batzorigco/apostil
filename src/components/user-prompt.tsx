"use client";

import { useState } from "react";
import { useApostil } from "../context";

export function UserPrompt() {
  const { user, setUser, commentMode, brandColor } = useApostil();
  const [name, setName] = useState("");

  // Only show when comment mode is activated and no user is set
  if (user || !commentMode) return null;

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setUser(trimmed);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
      style={{ zIndex: 99999 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 p-6 w-80">
        <h3 className="text-sm font-semibold text-neutral-900 mb-1">
          What&apos;s your name?
        </h3>
        <p className="text-xs text-neutral-500 mb-4">
          This will be shown with your comments.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="Enter your name"
          autoFocus
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm
                     placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300 mb-3"
        />
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="w-full py-2 rounded-lg text-white text-sm font-medium
                     disabled:opacity-30 transition-colors"
          style={{ backgroundColor: brandColor }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
