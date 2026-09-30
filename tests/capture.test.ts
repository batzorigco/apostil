import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { captureContext, describeElement, findThreadTarget } from "../src/capture";
import type { ApostilThread } from "../src/types";

const thread = (element: Element): ApostilThread => ({ id: "t", pageId: "home", pinX: 10, pinY: 20, resolved: false, comments: [], createdAt: "now", context: captureContext(element, element) });

beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 100, height: 100 }] as unknown as DOMRectList);
});
afterEach(() => vi.restoreAllMocks());

describe("comment snapshots", () => {
  it("escapes unusual identifiers and prefers explicit stable targets", () => {
    const button = document.createElement("button");
    button.id = 'radix:«id"'; button.setAttribute("data-comment-target", 'save"profile');
    document.body.append(button);
    const snapshot = describeElement(button);
    expect(document.querySelector(snapshot.selector)).toBe(button);
    expect(snapshot.selector).toContain("data-comment-target");
    expect(snapshot.selectorKind).toBe("stable");
  });

  it("does not use an ambiguous ID or attach a structural anchor to a different item", () => {
    document.body.innerHTML = '<div id="same"><button>First</button></div><div id="same"><button>Second</button></div>';
    const target = document.querySelectorAll("button")[1];
    const saved = thread(target);
    expect(saved.context?.anchor.selectorKind).toBe("structural");
    expect(findThreadTarget(saved)).toBe(target);
    target.textContent = "Different item";
    expect(findThreadTarget(saved)).toBeNull();
  });

  it("captures nested portaled surfaces and opening controls", () => {
    document.body.innerHTML = '<button aria-controls="dialog">Settings</button><div role="dialog" id="dialog"><button aria-controls="menu">More</button></div><div role="menu" id="menu"><button id="action">Rename</button></div>';
    const context = captureContext(document.querySelector("#action")!, document.querySelector("#action")!);
    expect(context.surfaces.map(s => s.kind)).toEqual(["dialog", "menu"]);
    expect(context.surfaces.map(s => s.trigger?.text)).toEqual(["Settings", "More"]);
  });

  it("hides pins when a dialog closes and recovers after remount", () => {
    document.body.innerHTML = '<dialog open id="modal"><button id="save">Save</button></dialog>';
    const saved = thread(document.querySelector("button")!);
    expect(findThreadTarget(saved)).not.toBeNull();
    document.querySelector("dialog")!.removeAttribute("open");
    expect(findThreadTarget(saved)).toBeNull();
    document.body.innerHTML = '<dialog open id="modal"><button id="save">Save</button></dialog>';
    expect(findThreadTarget(saved)).toBe(document.querySelector("button"));
    document.querySelector("dialog")!.style.display = "none";
    expect(findThreadTarget(saved)).toBeNull();
  });

  it("omits form values, private content and comment UI from captured text", () => {
    document.body.innerHTML = '<section id="profile">Profile<input value="secret"><textarea>secret</textarea><div data-comment-private>private</div><div data-apostil-ui>Comment body</div></section>';
    const context = captureContext(document.querySelector("section")!, document.querySelector("section")!);
    expect(context.element.text).toBe("Profile");
    expect(JSON.stringify(context)).not.toContain("secret");
  });

  it("bounds aria-labelledby text and keeps private content out of labels", () => {
    document.body.innerHTML = `<h2 id="title">Billing <span data-comment-private>4242 4242</span><input value="secret"></h2><p id="private" data-comment-private>Jane Doe</p><p id="long">${"x".repeat(1000)}</p><section id="card" aria-labelledby="title private missing long"></section>`;
    const { label } = describeElement(document.querySelector("#card")!);
    expect(label).toMatch(/^Billing x+$/);
    expect(label).toHaveLength(240);
    document.title = "t".repeat(1000);
    expect(captureContext(document.body, document.body).title).toHaveLength(240);
  });

  it("prioritizes legacy manual anchors over matching tag names", () => {
    document.body.innerHTML = '<section></section><div data-comment-target="section">Target</div>';
    const saved = { ...thread(document.querySelector("div")!), context: undefined, targetId: "section" };
    expect(findThreadTarget(saved)).toBe(document.querySelector("div"));
  });
});
