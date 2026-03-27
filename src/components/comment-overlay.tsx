"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRemarq } from "../context";
import { debug } from "../debug";
import { CommentPin } from "./comment-pin";
import { RemarqThreadPopover } from "./comment-thread";
import { CommentComposer } from "./comment-composer";
import { UserPrompt } from "./user-prompt";

type PendingPin = {
  x: number;
  y: number;
  targetId?: string;
  targetLabel?: string;
};

// Find the highest z-index on the page (cached per toggle)
let cachedHighZ = 0;
let cacheTimestamp = 0;
function getHighestZIndex(): number {
  const now = Date.now();
  if (now - cacheTimestamp < 500) return cachedHighZ; // cache for 500ms
  let max = 0;
  const els = document.querySelectorAll("[style*='z-index'], [class*='z-']");
  for (let i = 0; i < els.length; i++) {
    const z = parseInt(getComputedStyle(els[i]).zIndex, 10);
    if (!isNaN(z) && z > max) max = z;
  }
  cachedHighZ = Math.max(max, 100); // minimum 100
  cacheTimestamp = now;
  return cachedHighZ;
}

// Semantic elements that are meaningful containers
const SEMANTIC_TAGS = new Set([
  "SECTION", "NAV", "ASIDE", "HEADER", "FOOTER", "MAIN",
  "ARTICLE", "FORM", "DIALOG", "DETAILS",
]);

// Min size for a target, and max size ratio to viewport to avoid matching the whole page
const MIN_TARGET_SIZE = 50;
const MAX_VIEWPORT_RATIO = 0.85; // skip elements covering >85% of viewport in both dimensions

/**
 * Check if a div is a "visual panel" — a scrollable area, flex/grid child with defined bounds,
 * or a container with border/background that forms a distinct visual region.
 */
function isVisualPanel(el: HTMLElement): boolean {
  const style = getComputedStyle(el);

  // Scrollable container
  if (/auto|scroll/.test(style.overflow + style.overflowY + style.overflowX)) return true;

  // Has border or distinct background (likely a card/panel)
  if (style.borderWidth && style.borderWidth !== "0px" && style.borderStyle !== "none") return true;
  if (style.borderRadius && style.borderRadius !== "0px") return true;
  if (style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent") return true;
  if (style.boxShadow && style.boxShadow !== "none") return true;

  return false;
}

/**
 * Try to get a readable label from an element's content.
 * Looks for headings, strong text, or first significant text node nearby.
 */
function inferLabel(el: HTMLElement): string | null {
  // Check for a heading child
  const heading = el.querySelector("h1, h2, h3, h4, h5, h6, [class*='title'], [class*='heading']");
  if (heading) {
    const text = heading.textContent?.trim();
    if (text && text.length <= 40) return text;
  }

  // Check for a label-like first child text
  const firstText = el.querySelector("span, p, label, strong");
  if (firstText) {
    const text = firstText.textContent?.trim();
    if (text && text.length <= 30) return text;
  }

  return null;
}

/**
 * Build a stable CSS selector path for an element.
 */
function getElementId(el: HTMLElement): string {
  const manual = el.getAttribute("data-comment-target");
  if (manual) return manual;

  if (el.id) return `#${el.id}`;

  const label = el.getAttribute("aria-label");
  if (label) return `${el.tagName.toLowerCase()}[aria-label="${label}"]`;

  // nth-child path from nearest identifiable ancestor
  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  for (let depth = 0; cur && depth < 5; depth++) {
    if (cur.id) {
      parts.unshift(`#${cur.id}`);
      break;
    }
    const p: HTMLElement | null = cur.parentElement;
    if (p) {
      const siblings = Array.from(p.children);
      const idx = siblings.indexOf(cur);
      parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx + 1})`);
    } else {
      parts.unshift(cur.tagName.toLowerCase());
    }
    cur = p;
  }
  return parts.join(" > ");
}

/**
 * Derive a human-readable label for an element.
 */
function getElementLabel(el: HTMLElement): string {
  const manual = el.getAttribute("data-comment-label");
  if (manual) return manual;

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  // Try to infer from content
  const inferred = inferLabel(el);
  if (inferred) return inferred;

  const role = el.getAttribute("role");

  if (el.id) {
    const pretty = el.id
      .replace(/[-_]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return role ? `${pretty} (${role})` : pretty;
  }

  const tag = el.tagName.toLowerCase();
  if (SEMANTIC_TAGS.has(el.tagName)) return role ? `${tag} (${role})` : tag;
  if (role) return role;

  return tag;
}

/**
 * Walk up from the clicked element and find the best container to anchor the comment to.
 * Scores candidates by specificity — prefers the innermost meaningful panel.
 */
function findCommentTarget(el: HTMLElement, boundary: HTMLElement | null) {
  let current: HTMLElement | null = el;
  const candidates: { el: HTMLElement; score: number; depth: number }[] = [];
  let depth = 0;

  while (current && current !== boundary && current !== document.body) {
    const rect = current.getBoundingClientRect();
    const isBigEnough = rect.width >= MIN_TARGET_SIZE && rect.height >= MIN_TARGET_SIZE;
    const isTooBig =
      rect.width > window.innerWidth * MAX_VIEWPORT_RATIO &&
      rect.height > window.innerHeight * MAX_VIEWPORT_RATIO;

    if (isBigEnough && !isTooBig) {
      let score = 0;

      // Manual target — highest priority
      if (current.getAttribute("data-comment-target")) score = 100;
      // id
      else if (current.id) score = 80;
      // aria-label
      else if (current.getAttribute("aria-label")) score = 70;
      // role attribute
      else if (current.getAttribute("role")) score = 60;
      // semantic HTML tag
      else if (SEMANTIC_TAGS.has(current.tagName)) score = 50;
      // Visual panel (scrollable, bordered, shadowed, rounded)
      else if (isVisualPanel(current)) score = 40;

      if (score > 0) {
        candidates.push({ el: current, score, depth });
      }
    }

    current = current.parentElement;
    depth++;
  }

  if (candidates.length === 0) return null;

  // Prefer innermost among equally-scored candidates.
  // Among different scores: higher score wins, but add a bonus for being closer to the click.
  candidates.sort((a, b) => {
    const scoreA = a.score + Math.max(0, 10 - a.depth);
    const scoreB = b.score + Math.max(0, 10 - b.depth);
    return scoreB - scoreA;
  });

  const best = candidates[0];
  const targetId = getElementId(best.el);
  const targetLabel = getElementLabel(best.el);

  debug.log(" candidates:", candidates.map((c) => ({
    tag: c.el.tagName.toLowerCase(),
    id: c.el.id || undefined,
    class: c.el.className?.toString().slice(0, 60) || undefined,
    score: c.score,
    depth: c.depth,
    label: getElementLabel(c.el),
  })));

  return {
    targetId,
    targetLabel,
    element: best.el,
  };
}

export function CommentOverlay() {
  const { threads, commentMode, setCommentMode, user, addThread, setActiveThreadId } =
    useRemarq();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [pendingPixel, setPendingPixel] = useState<{ left: number; top: number } | null>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!commentMode || !overlayRef.current) return;

      const overlayRect = overlayRef.current.getBoundingClientRect();

      // Temporarily hide overlay so elementFromPoint hits the actual content
      const overlay = overlayRef.current;
      overlay.style.pointerEvents = "none";
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      overlay.style.pointerEvents = "";

      debug.log(" click at", { clientX: e.clientX, clientY: e.clientY });
      debug.log(" element below overlay:", elementBelow);

      // Log the DOM path for debugging
      if (elementBelow) {
        const path: string[] = [];
        let walk: HTMLElement | null = elementBelow;
        while (walk && walk !== document.body) {
          const attrs: string[] = [walk.tagName.toLowerCase()];
          if (walk.id) attrs.push(`#${walk.id}`);
          if (walk.getAttribute("data-comment-target")) attrs.push(`[data-comment-target="${walk.getAttribute("data-comment-target")}"]`);
          if (walk.getAttribute("aria-label")) attrs.push(`[aria-label="${walk.getAttribute("aria-label")}"]`);
          if (walk.getAttribute("role")) attrs.push(`[role="${walk.getAttribute("role")}"]`);
          if (SEMANTIC_TAGS.has(walk.tagName)) attrs.push("(semantic)");
          path.push(attrs.join(""));
          walk = walk.parentElement;
        }
        debug.log(" DOM path:", path.join(" → "));
      }

      const target = elementBelow ? findCommentTarget(elementBelow, overlayRef.current) : null;

      if (target) {
        const targetRect = target.element.getBoundingClientRect();
        const x = ((e.clientX - targetRect.left) / targetRect.width) * 100;
        const y = ((e.clientY - targetRect.top) / targetRect.height) * 100;
        debug.log(" ✅ target found:", {
          targetId: target.targetId,
          targetLabel: target.targetLabel,
          element: target.element,
          relativePos: { x: x.toFixed(1), y: y.toFixed(1) },
          targetRect: { w: targetRect.width, h: targetRect.height },
        });
        setPendingPin({ x, y, targetId: target.targetId, targetLabel: target.targetLabel });
      } else {
        const x = ((e.clientX - overlayRect.left) / overlayRect.width) * 100;
        const y = ((e.clientY - overlayRect.top) / overlayRect.height) * 100;
        debug.log(" ⚠️ no target found, using overlay-relative position:", {
          x: x.toFixed(1),
          y: y.toFixed(1),
        });
        setPendingPin({ x, y });
      }

      setPendingPixel({
        left: e.clientX - overlayRect.left,
        top: e.clientY - overlayRect.top,
      });
      setActiveThreadId(null);
    },
    [commentMode, setActiveThreadId]
  );

  const handleNewComment = useCallback(
    (body: string) => {
      if (!pendingPin) return;
      debug.log(" saving thread:", {
        pinX: pendingPin.x.toFixed(1),
        pinY: pendingPin.y.toFixed(1),
        targetId: pendingPin.targetId ?? "(none)",
        targetLabel: pendingPin.targetLabel ?? "(none)",
        body,
      });
      addThread(pendingPin.x, pendingPin.y, body, pendingPin.targetId, pendingPin.targetLabel);
      setPendingPin(null);
      setPendingPixel(null);
    },
    [pendingPin, addThread]
  );

  const cancelPending = useCallback(() => {
    setPendingPin(null);
    setPendingPixel(null);
    setCommentMode(false);
  }, [setCommentMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;

      // Escape always works — even when typing
      if (e.key === "Escape") {
        if (pendingPin) {
          setPendingPin(null);
          setPendingPixel(null);
          setCommentMode(false);
        } else if (commentMode) {
          setCommentMode(false);
        }
        return;
      }

      // Other shortcuts only when not typing
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "c" || e.key === "C") {
        if (!commentMode) {
          debug.log(" comment mode ON");
          setActiveThreadId(null);
          setCommentMode(true);
        } else {
          debug.log(" comment mode OFF");
          setCommentMode(false);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [commentMode, pendingPin, setCommentMode, setActiveThreadId]);

  // Sort: unresolved first, then resolved
  const sortedThreads = [...threads].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return (
    <>
      <UserPrompt />

      {/* Overlay layer */}
      <div
        ref={overlayRef}
        className={`fixed inset-0 ${
          commentMode
            ? "cursor-crosshair pointer-events-auto"
            : "pointer-events-none"
        }`}
        style={{ zIndex: commentMode ? getHighestZIndex() + 10 : 55 }}
        onMouseDown={handleClick}
      >
        {/* Existing pins */}
        {sortedThreads.map((thread, i) => (
          <div key={thread.id} className="pointer-events-auto">
            <CommentPin thread={thread} index={i} overlayRef={overlayRef} />
            <RemarqThreadPopover thread={thread} overlayRef={overlayRef} />
          </div>
        ))}

        {/* Pending pin */}
        {pendingPin && pendingPixel && user && (
          <div
            className="absolute z-[70] pointer-events-auto"
            style={{
              left: pendingPixel.left,
              top: pendingPixel.top,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full
                         flex items-center justify-center text-white text-xs font-semibold
                         shadow-lg ring-2 ring-white ring-offset-2 animate-bounce"
              style={{ backgroundColor: user.color }}
            >
              +
            </div>
            <div className="absolute ml-5 -mt-3 w-72">
              <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs text-neutral-500">New comment</p>
                  {pendingPin.targetLabel && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                      {pendingPin.targetLabel}
                    </span>
                  )}
                </div>
                <CommentComposer
                  onSubmit={handleNewComment}
                  placeholder="What's on your mind?"
                  autoFocus
                />
                <button
                  onClick={cancelPending}
                  className="mt-2 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comment mode hint */}
      {commentMode && !pendingPin && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
          <div className="bg-neutral-900/80 text-white text-sm px-4 py-2 rounded-full backdrop-blur-sm">
            Click anywhere to add a comment
          </div>
        </div>
      )}
    </>
  );
}
