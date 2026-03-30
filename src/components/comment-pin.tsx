"use client";

import { useState, useEffect, useCallback, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useApostil } from "../context";
import type { ApostilThread } from "../types";

/**
 * Find the target element using the stored targetId.
 * targetId can be a CSS selector or a data-comment-target value.
 */
function findTargetElement(targetId: string): HTMLElement | null {
  // First try as a CSS selector
  try {
    const el = document.querySelector(targetId);
    if (el instanceof HTMLElement) return el;
  } catch {
    // Invalid selector — fall through
  }

  // Then try as a data-comment-target value
  try {
    const el = document.querySelector(`[data-comment-target="${CSS.escape(targetId)}"]`);
    if (el instanceof HTMLElement) return el;
  } catch {
    // noop
  }

  return null;
}

/**
 * Resolves pixel position for a thread pin relative to the overlay.
 * Used only for NON-targeted pins (no targetId).
 */
function resolveOverlayPosition(
  thread: ApostilThread,
  overlayEl: HTMLElement | null
): { left: number; top: number } | null {
  if (!overlayEl) return null;
  const overlayRect = overlayEl.getBoundingClientRect();
  return {
    left: (thread.pinX / 100) * overlayRect.width,
    top: (thread.pinY / 100) * overlayRect.height,
  };
}

/**
 * Resolves pixel position relative to the overlay, for targeted pins.
 * Used by the thread popover which always renders in the overlay.
 */
function resolvePosition(
  thread: ApostilThread,
  overlayEl: HTMLElement | null
): { left: number; top: number } | null {
  if (!overlayEl) return null;
  const overlayRect = overlayEl.getBoundingClientRect();

  if (thread.targetId) {
    const target = findTargetElement(thread.targetId);
    if (target) {
      const targetRect = target.getBoundingClientRect();
      return {
        left: targetRect.left - overlayRect.left + (thread.pinX / 100) * targetRect.width,
        top: targetRect.top - overlayRect.top + (thread.pinY / 100) * targetRect.height,
      };
    }
    return null;
  }

  return {
    left: (thread.pinX / 100) * overlayRect.width,
    top: (thread.pinY / 100) * overlayRect.height,
  };
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
          style={{ backgroundColor: authorColor }}
        >
          {index + 1}
        </div>
        {!thread.resolved && !isActive && (
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ backgroundColor: authorColor }}
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

// ─── Targeted pin (portals into the target element) ───────────────

function TargetedPin({
  thread,
  index,
}: {
  thread: ApostilThread;
  index: number;
}) {
  const { activeThreadId, setActiveThreadId } = useApostil();
  const isActive = activeThreadId === thread.id;
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!thread.targetId) return;

    function tryFind() {
      const el = findTargetElement(thread.targetId!);
      if (el) {
        const pos = getComputedStyle(el).position;
        if (pos === "static") el.style.position = "relative";
        setTargetEl(el);
      } else {
        setTargetEl(null);
      }
    }

    tryFind();

    // Watch for DOM changes — target element may appear/disappear (popovers, dialogs)
    const observer = new MutationObserver(() => tryFind());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [thread.targetId]);

  if (!targetEl) return null;

  return createPortal(
    <div
      className="absolute pointer-events-auto"
      style={{
        left: `${thread.pinX}%`,
        top: `${thread.pinY}%`,
        transform: "translate(-50%, -50%)",
        zIndex: 10,
      }}
    >
      <PinButton
        thread={thread}
        index={index}
        isActive={isActive}
        onClick={(e) => {
          e.stopPropagation();
          setActiveThreadId(isActive ? null : thread.id);
        }}
      />
    </div>,
    targetEl
  );
}

// ─── Overlay pin (non-targeted, positioned in the overlay) ────────

function OverlayPin({
  thread,
  index,
  overlayRef,
}: {
  thread: ApostilThread;
  index: number;
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  const { activeThreadId, setActiveThreadId } = useApostil();
  const isActive = activeThreadId === thread.id;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const updatePos = useCallback(() => {
    setPos(resolveOverlayPosition(thread, overlayRef.current));
  }, [thread, overlayRef]);

  useEffect(() => {
    updatePos();
    window.addEventListener("resize", updatePos);
    document.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      document.removeEventListener("scroll", updatePos, true);
    };
  }, [updatePos]);

  if (!pos) return null;

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: pos.left,
        top: pos.top,
        transform: "translate(-50%, -50%)",
        zIndex: 60,
      }}
    >
      <PinButton
        thread={thread}
        index={index}
        isActive={isActive}
        onClick={(e) => {
          e.stopPropagation();
          setActiveThreadId(isActive ? null : thread.id);
        }}
      />
    </div>
  );
}

// ─── Public CommentPin (delegates to targeted or overlay) ─────────

export function CommentPin({
  thread,
  index,
  overlayRef,
}: {
  thread: ApostilThread;
  index: number;
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  if (thread.resolved) return null;
  if (thread.targetId) {
    return <TargetedPin key={`targeted-${thread.id}`} thread={thread} index={index} />;
  }
  return <OverlayPin key={`overlay-${thread.id}`} thread={thread} index={index} overlayRef={overlayRef} />;
}

export { resolvePosition, findTargetElement };
