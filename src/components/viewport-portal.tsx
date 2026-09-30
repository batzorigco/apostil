"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isVisible } from "../capture";

// One observer and one frame serve every pin and portal, however many threads are on the page.
const listeners = new Set<() => void>();
let frame = 0;
let observer: MutationObserver;
const flush = () => { frame = 0; listeners.forEach(listener => listener()); };
export const scheduleLayout = () => { frame ||= requestAnimationFrame(flush); };

/** Run `listener` at most once per frame after the page scrolls, resizes or changes. */
export function onLayoutChange(listener: () => void) {
  if (!listeners.size) {
    observer = new MutationObserver(scheduleLayout);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "open", "hidden", "data-state", "aria-hidden"] });
    window.addEventListener("resize", scheduleLayout);
    document.addEventListener("scroll", scheduleLayout, true);
    document.addEventListener("toggle", scheduleLayout, true);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    cancelAnimationFrame(frame); frame = 0; observer.disconnect();
    window.removeEventListener("resize", scheduleLayout);
    document.removeEventListener("scroll", scheduleLayout, true);
    document.removeEventListener("toggle", scheduleLayout, true);
  };
}

// jsdom and browsers before 2022 throw on :modal; there the viewport UI stays on the body.
const isModal = (element: Element) => { try { return element.matches(":modal"); } catch { return false; } };

/** The topmost open host surface, or only a modal dialog, which makes everything outside itself inert. */
export function usePortalHost(modalOnly = false) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const update = () => {
      const surfaces = Array.from(document.querySelectorAll(modalOnly ? "dialog[open]" : 'dialog[open], [role="dialog"], [role="alertdialog"], [popover]'))
        .filter(surface => !surface.closest("[data-apostil-ui]") && isVisible(surface) && (!modalOnly || isModal(surface)));
      setHost((surfaces[surfaces.length - 1] as HTMLElement | undefined) ?? document.body);
    };
    update();
    return onLayoutChange(update);
  }, [modalOnly]);
  return host;
}

/** Escape app containers whose transforms or overflow would move or clip fixed UI. */
export function ViewportPortal({ children }: { children: ReactNode }) {
  const host = usePortalHost(true);
  return host ? createPortal(children, host) : null;
}
