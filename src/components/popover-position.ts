"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

type Point = { left: number; top: number };
type Bounds = Point & { width: number; height: number };

/** Use anchor coordinates and size only, never the popup's previous placement. */
export function placePopover(anchor: Point, size: { width: number; height: number }, viewport: Bounds): Point {
  const margin = 12;
  const gap = 20;
  const minX = viewport.left + margin;
  const minY = viewport.top + margin;
  const maxX = Math.max(minX, viewport.left + viewport.width - margin - size.width);
  const maxY = Math.max(minY, viewport.top + viewport.height - margin - size.height);
  const right = anchor.left + gap;
  const left = anchor.left - gap - size.width;
  return {
    left: Math.max(minX, Math.min(right <= maxX ? right : left, maxX)),
    // Slide along the viewport edge instead of jumping above/below the pin.
    top: Math.max(minY, Math.min(anchor.top - 12, maxY)),
  };
}

export function usePopoverPosition(anchor: Point | null, overlayRef: RefObject<HTMLDivElement | null>, popupRef: RefObject<HTMLDivElement | null>, enabled: boolean, sidebarOpen = false) {
  const [position, setPosition] = useState<Point | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !anchor) { setPosition(null); return; }
    const popup = popupRef.current;
    const overlay = overlayRef.current;
    if (!popup || !overlay) return;
    const update = () => {
      const origin = overlay.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      let width = viewport?.width ?? window.innerWidth;
      const sidebar = sidebarOpen ? document.querySelector('[data-apostil-ui="sidebar"]')?.getBoundingClientRect() : null;
      // Leave room for both views when the screen is wide enough.
      if (sidebar && sidebar.left - left >= popup.offsetWidth + 24) width = Math.min(width, sidebar.left - left);
      const next = placePopover({ left: origin.left + anchor.left, top: origin.top + anchor.top },
        { width: popup.offsetWidth, height: popup.offsetHeight },
        { left, top: viewport?.offsetTop ?? 0, width, height: viewport?.height ?? window.innerHeight });
      next.left -= origin.left;
      next.top -= origin.top;
      setPosition(previous => previous?.left === next.left && previous?.top === next.top ? previous : next);
    };
    update();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resize?.observe(popup);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      resize?.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [anchor, enabled, overlayRef, popupRef, sidebarOpen]);
  return position;
}
