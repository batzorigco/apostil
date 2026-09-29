import { findThreadTarget } from "./capture";
import type { ApostilThread } from "./types";

/** Reveal the saved anchor without activating controls or opening unknown dialogs. */
export function scrollToThread(thread: ApostilThread): boolean {
  const target = findThreadTarget(thread);
  if (!target) return false;

  // Sticky footers can already be inside the viewport, but underneath the page.
  // Measure their normal flow position so scrolling reveals the actual section.
  // Restore synchronously, before the browser paints or smooth scrolling begins.
  const sticky: { element: HTMLElement; style: string }[] = [];
  try {
    for (let element: HTMLElement | null = target; element; element = element.parentElement) {
      if (getComputedStyle(element).position !== "sticky") continue;
      sticky.push({ element, style: element.style.cssText });
      element.style.setProperty("position", "relative", "important");
      for (const edge of ["top", "right", "bottom", "left"]) element.style.setProperty(edge, "auto", "important");
    }
    target.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "center",
      inline: "nearest",
    });
    return true;
  } finally {
    for (const { element, style } of sticky) element.style.cssText = style;
  }
}

export function threadLocationHint(thread: ApostilThread): string {
  const surfaces = thread.context?.surfaces;
  return surfaces?.length
    ? `Open ${surfaces.map(surface => surface.element.label || surface.kind).join(" → ")} to see this comment on the page.`
    : "This comment’s section is no longer visible or its location has changed.";
}
