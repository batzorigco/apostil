import type { ApostilCaptureContext, ApostilElement, ApostilSurface, ApostilThread } from "./types";

export const SURFACE_SELECTOR = 'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [popover], [data-comment-surface], [data-radix-popper-content-wrapper], details';
const ATTRIBUTES = ["data-comment-target", "data-testid", "data-test", "data-comment-source", "role", "aria-label", "aria-labelledby", "aria-controls", "aria-expanded", "aria-selected", "data-state", "name", "type"];
const MAX_TEXT = 240;
const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\n\r\f]/g, " ")}"`;
const attrSelector = (name: string, value: string) => `[${name}=${quote(value)}]`;

function unique(selector: string, element: Element): boolean {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch { return false; }
}

// Do not collect input values, arbitrary data attributes, or Apostil's own text.
function visibleText(element: Element | null): string {
  if (!element || element.closest('[data-comment-private], input, textarea, select, [contenteditable]')) return "";
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('[data-apostil-ui], input, textarea, select, [contenteditable], [data-comment-private], script, style').forEach(el => el.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

export function describeElement(element: Element): ApostilElement {
  let selector = "";
  let selectorKind: ApostilElement["selectorKind"] = "stable";
  for (const name of ["data-comment-target", "data-testid", "data-test", "id", "aria-label"]) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const candidate = attrSelector(name, value);
    if (unique(candidate, element)) { selector = candidate; break; }
  }
  if (!selector) {
    selectorKind = "structural";
    const parts: string[] = [];
    let current: Element | null = element;
    while (current) {
      const id = current.getAttribute("id");
      if (id && unique(attrSelector("id", id), current)) {
        parts.unshift(attrSelector("id", id));
        break;
      }
      const parent: Element | null = current.parentElement;
      parts.unshift(parent
        ? `${current.tagName.toLowerCase()}:nth-child(${Array.from(parent.children).indexOf(current) + 1})`
        : current.tagName.toLowerCase());
      current = parent;
    }
    selector = parts.join(" > ");
  }
  const text = visibleText(element);
  const attributes = Object.fromEntries(ATTRIBUTES.flatMap(name => {
    const value = element.getAttribute(name);
    return value ? [[name, value.slice(0, 500)]] : [];
  }));
  const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/).map(id => visibleText(document.getElementById(id))).filter(Boolean).join(" ").slice(0, MAX_TEXT);
  return {
    selector, selectorKind, tag: element.tagName.toLowerCase(),
    id: element.id || undefined, classes: Array.from(element.classList).slice(0, 20),
    label: (element.getAttribute("data-comment-label") || element.getAttribute("aria-label") || labelledBy)?.slice(0, MAX_TEXT) || undefined,
    text: text || undefined, attributes,
  };
}

function findTrigger(surface: Element): Element | undefined {
  if (surface.tagName === "DETAILS") return surface.querySelector("summary") ?? undefined;
  const manual = surface.getAttribute("data-comment-trigger");
  if (manual) {
    try { const el = document.querySelector(manual); if (el) return el; } catch { /* Invalid hints are ignored. */ }
  }
  if (!surface.id) return undefined;
  return Array.from(document.querySelectorAll('[aria-controls], [popovertarget]')).find(el =>
    el.getAttribute("aria-controls")?.split(/\s+/).includes(surface.id) || el.getAttribute("popovertarget") === surface.id);
}

export function captureContext(element: Element, anchor: Element): ApostilCaptureContext {
  const surfaces: ApostilSurface[] = [];
  const seen = new Set<Element>();
  let surface = element.closest(SURFACE_SELECTOR);
  while (surface && !seen.has(surface)) {
    seen.add(surface);
    const trigger = findTrigger(surface);
    surfaces.unshift({
      kind: surface.getAttribute("data-comment-surface") || surface.getAttribute("role") || (surface.hasAttribute("popover") ? "popover" : surface.tagName.toLowerCase()),
      element: describeElement(surface), trigger: trigger ? describeElement(trigger) : undefined,
    });
    surface = surface.parentElement?.closest(SURFACE_SELECTOR) ?? trigger?.closest(SURFACE_SELECTOR) ?? null;
  }
  return {
    version: 1, capturedAt: new Date().toISOString(),
    // Keep the route but omit query strings, which can contain credentials.
    url: window.location.origin + window.location.pathname,
    title: document.title.slice(0, MAX_TEXT),
    viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
    element: describeElement(element), anchor: describeElement(anchor), surfaces,
  };
}

export function isVisible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element.closest('[hidden], [aria-hidden="true"], [data-state="closed"], dialog:not([open])')) return false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    if (current.hasAttribute("popover")) {
      try { if (!current.matches(":popover-open")) return false; } catch { /* Older browsers. */ }
    }
  }
  return element.getClientRects().length > 0;
}

export function resolveElement(snapshot: ApostilElement, requireVisible = true): HTMLElement | null {
  try {
    const matches = document.querySelectorAll(snapshot.selector);
    if (matches.length !== 1) return null;
    const el = matches[0];
    if (!(el instanceof HTMLElement) || (requireVisible && !isVisible(el)) || el.tagName.toLowerCase() !== snapshot.tag) return null;
    // Positional paths must not silently attach to a different repeated item.
    if (snapshot.selectorKind === "structural" && snapshot.text && describeElement(el).text !== snapshot.text) return null;
    return el;
  } catch { return null; }
}

export function findThreadTarget(thread: ApostilThread, requireVisible = true): HTMLElement | null {
  if (thread.context) {
    if (thread.context.surfaces?.some(surface => !resolveElement(surface.element, requireVisible))) return null;
    return resolveElement(thread.context.anchor, requireVisible);
  }
  if (!thread.targetId) return null;
  // Legacy manual targets take precedence over selectors with the same name.
  for (const selector of [attrSelector("data-comment-target", thread.targetId), thread.targetId]) {
    try {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1 && matches[0] instanceof HTMLElement && (!requireVisible || isVisible(matches[0]))) return matches[0];
    } catch { /* Legacy selector may be invalid. */ }
  }
  return null;
}
