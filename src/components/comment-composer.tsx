"use client";

import { useState, useRef, useEffect } from "react";
import { Send } from "../icons";

export function CommentComposer({
  onSubmit,
  placeholder = "Add a comment...",
  autoFocus = false,
}: {
  onSubmit: (body: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <div className="flex gap-2 items-end">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm
                   placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300
                   min-h-[36px] max-h-[120px]"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="flex items-center justify-center w-8 h-8 rounded-lg
                   bg-neutral-900 text-white disabled:opacity-30
                   hover:bg-neutral-700 transition-colors shrink-0"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
