import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { scrollToThread } from "../src/thread-navigation";
import { resolvePosition } from "../src/components/comment-pin";
import type { ApostilThread } from "../src/types";

const thread: ApostilThread = { id: "footer", pageId: "home", targetId: "#footer", pinX: 50, pinY: 20, resolved: false, createdAt: "now", comments: [] };
beforeEach(() => {
  document.body.innerHTML = '<main id="hero">Hero</main><footer id="footer" style="position: sticky; bottom: 0; color: red"><span>Footer</span></footer><div data-apostil-ui="overlay"></div>';
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 } as DOMRect);
});
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("hides the sticky footer pin behind the hero, then shows it when revealed", () => {
  const footer = document.querySelector("footer")!;
  const overlay = document.querySelector<HTMLDivElement>('[data-apostil-ui="overlay"]')!;
  const hit = vi.fn(() => [overlay, document.querySelector("main")!, footer]);
  Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: hit });
  try {
    expect(resolvePosition(thread, overlay)).toBeNull();
    hit.mockReturnValue([overlay, footer.querySelector("span")!, footer]);
    expect(resolvePosition(thread, overlay)).toEqual({ left: 250, top: 100 });
    expect(hit).toHaveBeenLastCalledWith(250, 100);
  } finally { Reflect.deleteProperty(document, "elementsFromPoint"); }
});

it("scrolls a sticky section to its flow position and immediately restores its styles", () => {
  const footer = document.querySelector("footer")!;
  const original = footer.style.cssText;
  const scroll = vi.fn(() => {
    expect(footer.style.position).toBe("relative");
    expect(footer.style.bottom).toBe("auto");
  });
  footer.scrollIntoView = scroll;
  expect(scrollToThread(thread)).toBe(true);
  expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center", inline: "nearest" });
  expect(footer.style.cssText).toBe(original);
});

it("respects reduced motion and handles anchors inside sticky ancestors", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const footer = document.querySelector("footer")!;
  const child = footer.querySelector("span")!;
  child.id = "footer-label";
  const scroll = vi.fn(() => expect(footer.style.position).toBe("relative"));
  child.scrollIntoView = scroll;
  expect(scrollToThread({ ...thread, targetId: "#footer-label" })).toBe(true);
  expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" }));
  expect(footer.style.position).toBe("sticky");
});

it("opens the target's native dialog without clicking application controls", () => {
  document.body.innerHTML = '<button id="trigger">Open</button><dialog><div id="footer">Hidden comment</div></dialog>';
  const click = vi.fn();
  document.querySelector("button")!.addEventListener("click", click);
  const dialog = document.querySelector("dialog")!;
  const open = dialog.showModal = vi.fn(() => { dialog.open = true; });
  const scroll = vi.fn();
  document.getElementById("footer")!.scrollIntoView = scroll;
  expect(scrollToThread(thread)).toBe(true);
  expect(open).toHaveBeenCalledOnce();
  expect(scroll).toHaveBeenCalledOnce();
  expect(click).not.toHaveBeenCalled();
  expect(scrollToThread(thread)).toBe(true);
  expect(open).toHaveBeenCalledOnce();
});

it("opens nested native surfaces from outer to inner", () => {
  document.body.innerHTML = '<dialog><details><summary>More</summary><div popover><div id="footer">Hidden comment</div></div></details></dialog>';
  const dialog = document.querySelector("dialog")!;
  const details = document.querySelector("details")!;
  const popover = document.querySelector<HTMLElement>("[popover]")!;
  let popoverOpen = false;
  const matches = popover.matches.bind(popover);
  vi.spyOn(popover, "matches").mockImplementation(selector => selector === ":popover-open" ? popoverOpen : matches(selector));
  dialog.showModal = vi.fn(() => { dialog.open = true; });
  popover.showPopover = vi.fn(() => {
    expect(dialog.open).toBe(true);
    expect(details.open).toBe(true);
    popoverOpen = true;
    popover.style.display = "block";
  });
  document.getElementById("footer")!.scrollIntoView = vi.fn();
  expect(scrollToThread(thread)).toBe(true);
  expect(popover.showPopover).toHaveBeenCalledOnce();
});

it("keeps the fallback for custom hidden dialogs and unavailable native APIs", () => {
  document.body.innerHTML = '<button aria-controls="custom">Open</button><div role="dialog" id="custom" hidden><div id="footer">Hidden</div></div>';
  const click = vi.fn();
  document.querySelector("button")!.addEventListener("click", click);
  expect(scrollToThread(thread)).toBe(false);
  expect(click).not.toHaveBeenCalled();
  document.body.innerHTML = '<dialog><div id="footer">Hidden</div></dialog>';
  document.querySelector("dialog")!.showModal = vi.fn(() => { throw new Error("Unavailable"); });
  expect(scrollToThread(thread)).toBe(false);
});
