import { findThreadTarget, resolveElement } from "./capture";
import type { ApostilThread } from "./types";

/** Open identified native surfaces without clicking arbitrary application controls. */
function revealThreadSurfaces(thread: ApostilThread): void {
  const target = findThreadTarget(thread, false);
  if (!target) return;
  const surfaces = new Set<HTMLElement>();
  const addAncestors = (element: HTMLElement) => {
    const ancestors: HTMLElement[] = [];
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      if (current.matches('dialog, [popover], details')) ancestors.unshift(current);
    }
    ancestors.forEach(surface => surfaces.add(surface));
  };
  for (const saved of thread.context?.surfaces ?? []) {
    const surface = resolveElement(saved.element, false);
    if (surface) addAncestors(surface);
  }
  addAncestors(target);
  for (const surface of surfaces) {
    try {
      if (surface instanceof HTMLDialogElement && !surface.open) surface.showModal();
      else if (surface.hasAttribute("popover") && !surface.matches(":popover-open")) surface.showPopover();
      else if (surface instanceof HTMLDetailsElement) surface.open = true;
    } catch {
      // Unsupported APIs or unavailable surfaces retain the manual location hint.
      return;
    }
  }
}

/** Reveal and scroll to the saved anchor. */
export function scrollToThread(thread: ApostilThread): boolean {
  if (!findThreadTarget(thread)) revealThreadSurfaces(thread);
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
