"use client";

import { useState, useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { getTaskStatus } from "../task-status";
import { useApostil } from "../context";
import type { ApostilThread } from "../types";

import { findThreadTarget } from "../capture";

export function resolvePosition(thread: ApostilThread, overlayEl: HTMLElement | null): { left: number; top: number } | null {
  if (!overlayEl) return null;
  const overlay = overlayEl.getBoundingClientRect();
  if (thread.targetId || thread.context) {
    const target = findThreadTarget(thread);
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    const x = rect.left + thread.pinX / 100 * rect.width;
    const y = rect.top + thread.pinY / 100 * rect.height;
    // Hide pins clipped by a scrolling panel.
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX) && (x < bounds.left || x > bounds.right)) return null;
      if (/auto|scroll|hidden|clip/.test(style.overflowY) && (y < bounds.top || y > bounds.bottom)) return null;
    }
    // A sticky/fixed target may sit behind other content while still having a
    // viewport rect. Do not float its pin above the section covering it.
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return null;
    if (typeof document.elementsFromPoint === "function") {
      const front = document.elementsFromPoint(x, y).find(element => !element.closest("[data-apostil-ui]"));
      if (!front || !target.contains(front)) return null;
    }
    return { left: x - overlay.left, top: y - overlay.top };
  }
  return { left: thread.pinX / 100 * overlay.width, top: thread.pinY / 100 * overlay.height };
}

export function usePinPosition(thread: ApostilThread, overlayRef: RefObject<HTMLDivElement | null>, enabled = true) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const update = () => {
      const next = resolvePosition(thread, overlayRef.current);
      setPos(previous => previous?.left === next?.left && previous?.top === next?.top ? previous : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "open", "hidden", "data-state", "aria-hidden"] });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const target = findThreadTarget(thread);
    if (target) resize?.observe(target);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    document.addEventListener("toggle", schedule, true);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); resize?.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      document.removeEventListener("toggle", schedule, true);
    };
  }, [thread, overlayRef, enabled]);
  return pos;
}

// ─── Pin button (shared rendering) ────────────────────────────────

function PinButton({
  thread,
  index,
  isActive,
  onClick,
}: {
  thread: ApostilThread;
  index: number;
  isActive: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const authorColor = thread.comments[0]?.author.color ?? "#df461c";
  const [hovered, setHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!hovered || !buttonRef.current) {
      setTooltipPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setTooltipPos({
      left: rect.left + rect.width / 2,
      top: rect.bottom + 4,
    });
  }, [hovered]);

  return (
    <>
      <button
        type="button"
        aria-label={`Open comment ${index + 1}${getTaskStatus(thread) === "needs_review" ? " — Needs review" : ""}`}
        ref={buttonRef}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ position: "relative" }}
      >
        <div
          className={`
            flex items-center justify-center
            w-7 h-7 rounded-full text-white text-xs font-semibold
            shadow-lg cursor-pointer
            transition-all duration-200
            ${isActive ? "scale-125 ring-2 ring-white ring-offset-2" : "hover:scale-110"}
            ${thread.resolved ? "opacity-40" : ""}
          `}
          style={{ backgroundColor: getTaskStatus(thread) === "needs_review" ? "#b45309" : authorColor }}
        >
          {index + 1}
        </div>
        {!thread.resolved && !isActive && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ backgroundColor: getTaskStatus(thread) === "needs_review" ? "#b45309" : authorColor }}
          />
        )}
      </button>
      {thread.targetLabel && hovered && tooltipPos && createPortal(
        <div
          className="fixed whitespace-nowrap text-[10px] bg-neutral-800 text-white px-1.5 py-0.5 rounded pointer-events-none"
          style={{
            left: tooltipPos.left,
            top: tooltipPos.top,
            transform: "translateX(-50%)",
            zIndex: 999999,
          }}
        >
          {thread.targetLabel}
        </div>,
        document.body
      )}
    </>
  );
}

export function CommentPin({ thread, index, overlayRef }: {
  thread: ApostilThread; index: number; overlayRef: RefObject<HTMLDivElement | null>;
}) {
  const { activeThreadId, setActiveThreadId } = useApostil();
  const pos = usePinPosition(thread, overlayRef);
  if (!pos || thread.resolved) return null;
  return <div data-apostil-ui="pin" className="absolute pointer-events-auto"
    style={{ left: pos.left, top: pos.top, transform: "translate(-50%, -50%)", zIndex: 60 }}
    onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
    <PinButton thread={thread} index={index} isActive={activeThreadId === thread.id} onClick={e => {
      e.preventDefault(); e.stopPropagation(); setActiveThreadId(activeThreadId === thread.id ? null : thread.id);
    }} />
  </div>;
}
