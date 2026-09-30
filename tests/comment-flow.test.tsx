import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { ApostilProvider, useApostil } from "../src/context";
import { CommentOverlay } from "../src/components/comment-overlay";
import { CommentSidebar } from "../src/components/comment-sidebar";
import { CommentToggle } from "../src/components/comment-toggle";
import type { ApostilStorage, ApostilThread } from "../src/types";

it("scrolls to the selected sidebar comment from either tab without reloading the page", async () => {
  const thread: ApostilThread = { id: "footer-task", pageId: "home", targetId: "#footer", pinX: 50, pinY: 20, resolved: false, createdAt: "now", comments: [{ id: "c1", threadId: "footer-task", author: { id: "u", name: "Reviewer", color: "red" }, body: "Adjust footer spacing", createdAt: "now" }] };
  const storage: ApostilStorage = { load: async () => [thread], save: async () => {}, loadAll: async () => [{ pageId: "home", threads: [thread] }] };
  render(<ApostilProvider pageId="home" storage={storage}><Controls /><footer id="footer">Page footer</footer><CommentSidebar /></ApostilProvider>);
  const scroll = vi.fn();
  document.querySelector("footer")!.scrollIntoView = scroll;
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("List"));
  fireEvent.click(screen.getByText("Adjust footer spacing"));
  expect(scroll).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("All Pages"));
  await screen.findByText("1 open across 1 pages");
  fireEvent.click(screen.getByText("Adjust footer spacing"));
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Reply" }).getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(screen.getByText("Adjust footer spacing"));
  expect(scroll).toHaveBeenCalledTimes(2);
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 100, height: 100 }] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Controls() {
  const api = useApostil();
  return <div data-apostil-ui><button disabled={!api.loaded} onClick={() => { api.setUser("Alice"); api.setCommentMode(true); }}>Comment</button><button onClick={() => api.setSidebarOpen(true)}>List</button></div>;
}

it("does not turn a failed REST load into an empty save", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));
  function ErrorState() {
    const { storageError, addThread } = useApostil();
    return <><p>{storageError}</p><button onClick={() => addThread(10, 20, "Should not save")}>Try comment</button></>;
  }
  render(<ApostilProvider pageId="failed-load"><Controls /><ErrorState /></ApostilProvider>);
  await screen.findByText("Could not load comments (503).");
  expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText("Try comment"));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/apostil?pageId=failed-load");
});

it("keeps legacy custom load/save adapters usable without silently reading a different all-pages endpoint", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const storage: ApostilStorage = { load: async () => [], save: vi.fn().mockResolvedValue(undefined) };
  render(<ApostilProvider pageId="home" storage={storage}><Controls /><CommentSidebar /></ApostilProvider>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("List"));
  fireEvent.click(screen.getByText("All Pages"));
  await screen.findByText("This storage adapter does not support all pages.");
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps global comment UI outside scrolling and transformed app containers", async () => {
  const view = render(<div data-testid="app-shell" style={{ transform: "translateY(-200px)", overflow: "hidden", position: "relative" }}>
    <ApostilProvider pageId="home" storage={{ load: async () => [], save: async () => {} }}>
      <Controls /><CommentOverlay /><CommentSidebar /><CommentToggle />
    </ApostilProvider>
  </div>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  const controls = screen.getByTitle("Add comment").closest('[data-apostil-ui="controls"]')!;
  expect(controls.parentElement).toBe(document.body);
  expect(screen.getByTestId("app-shell").contains(controls)).toBe(false);

  fireEvent.click(screen.getByTitle("Toggle comment list"));
  const sidebar = screen.getByLabelText("Close comments").closest('[data-apostil-ui="sidebar"]')!;
  expect(sidebar.parentElement).toBe(document.body);
  expect(sidebar.hasAttribute("hidden")).toBe(false);
  fireEvent.click(screen.getByLabelText("Close comments"));
  expect(sidebar.hasAttribute("hidden")).toBe(true);

  fireEvent.click(screen.getByText("Comment"));
  const hint = screen.getByText("Click to comment · Esc to interact with the page");
  expect(hint.closest('[data-apostil-ui="overlay"]')?.parentElement).toBe(document.body);
  view.unmount();
  expect(document.querySelector('[data-apostil-ui="controls"]')).toBeNull();
  expect(document.querySelector('[data-apostil-ui="sidebar"]')).toBeNull();
});

it("records the clicked control in an open dialog without activating it", async () => {
  const click = vi.fn();
  const save = vi.fn().mockResolvedValue(undefined);
  render(<ApostilProvider pageId="settings" storage={{ load: async () => [], save }}><Controls /><dialog open id="settings"><button id="delete" onClick={click}>Delete account</button></dialog><CommentOverlay /></ApostilProvider>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("Comment"));
  fireEvent.pointerDown(screen.getByRole("button", { name: "Delete account" }), { clientX: 10, clientY: 10 });
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  expect(click).not.toHaveBeenCalled();
  const input = screen.getByPlaceholderText("What's on your mind?");
  fireEvent.change(input, { target: { value: "Use a quieter style" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(save).toHaveBeenCalled());
  const threads = save.mock.calls.at(-1)![1] as ApostilThread[];
  expect(threads[0].context?.element.id).toBe("delete");
  expect(threads[0].context?.surfaces[0].kind).toBe("dialog");
  expect(threads[0].comments[0].body).toBe("Use a quieter style");
});

it("does not save old-page threads under a new page while loading", async () => {
  const thread = { id: "old", pageId: "old", comments: [], resolved: false } as unknown as ApostilThread;
  const save = vi.fn().mockResolvedValue(undefined);
  const storage = { load: vi.fn(async (page: string) => page === "old" ? [thread] : []), save };
  const view = render(<ApostilProvider pageId="old" storage={storage}><Controls /></ApostilProvider>);
  await waitFor(() => expect(save).toHaveBeenCalled());
  view.rerender(<ApostilProvider pageId="new" storage={storage}><Controls /></ApostilProvider>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  expect(save.mock.calls.some(([page, data]) => page === "new" && data.length)).toBe(false);
});

it("shows review instructions, lets a reviewer complete a task and reopen it", async () => {
  const thread: ApostilThread = { id: "review", pageId: "home", pinX: 10, pinY: 20, resolved: false, status: "needs_review", createdAt: "2026-01-01", comments: [
    { id: "c1", threadId: "review", author: { id: "u", name: "Alice", color: "red" }, body: "Improve spacing", createdAt: "2026-01-01" },
    { id: "c2", threadId: "review", author: { id: "ai", name: "Codex", color: "blue" }, body: "Updated the spacing", createdAt: "2026-01-01", taskUpdate: { status: "needs_review", details: "Check the layout on your phone." } },
  ] };
  const save = vi.fn().mockResolvedValue(undefined);
  render(<ApostilProvider pageId="home" storage={{ load: async () => [thread], save }}><Controls /><CommentSidebar /></ApostilProvider>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("List"));
  expect(screen.queryByRole("button", { name: "Send to AI" })).toBeNull();
  expect(screen.getByText("Needs review (1)")).toBeTruthy();
  fireEvent.click(screen.getByText("Improve spacing"));
  expect(screen.getByText("Check the layout on your phone.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Task status"), { target: { value: "completed" } });
  expect(screen.getByText("Completed (1)")).toBeTruthy();
  await waitFor(() => expect(save.mock.calls.at(-1)?.[1][0]).toMatchObject({ status: "completed", resolved: true }));
  fireEvent.click(screen.getByLabelText("Reopen task"));
  expect(screen.getByText("Open (1)")).toBeTruthy();
  await waitFor(() => expect(save.mock.calls.at(-1)?.[1][0]).toMatchObject({ status: "open", resolved: false }));
});

it("marks replies read when expanded, avoids repeating the original comment, and collapses groups", async () => {
  const thread: ApostilThread = { id: "read-state", pageId: "home", pinX: 10, pinY: 10, resolved: false, createdAt: "2026-01-01", comments: [
    { id: "original", threadId: "read-state", author: { id: "reviewer", name: "Reviewer", color: "blue" }, body: "Original feedback", createdAt: "2026-01-01" },
    { id: "reply", threadId: "read-state", author: { id: "ai", name: "Codex", color: "blue" }, body: "Fixed the contrast", createdAt: "2026-01-01" },
  ] };
  const storage = { load: async () => [thread], save: async () => {} };
  const view = render(<ApostilProvider pageId="home" storage={storage}><Controls /><CommentSidebar /></ApostilProvider>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("List"));
  fireEvent.click(screen.getByRole("button", { name: "1 new reply" }));
  expect(screen.getAllByText("Original feedback")).toHaveLength(1);
  expect(screen.getByText("Fixed the contrast")).toBeTruthy();
  fireEvent.click(screen.getByText("Original feedback"));
  expect(screen.queryByText("Fixed the contrast")).toBeNull();
  const card = screen.getByRole("article", { name: "Comment by Reviewer" });
  fireEvent.keyDown(card, { key: "Enter" });
  expect(screen.getByText("Fixed the contrast")).toBeTruthy();
  fireEvent.keyDown(card, { key: " " });
  expect(screen.queryByText("Fixed the contrast")).toBeNull();
  fireEvent.click(screen.getByText("Original feedback"));
  fireEvent.click(screen.getByRole("button", { name: "1 reply" }));
  expect(screen.queryByText("Fixed the contrast")).toBeNull();
  expect(screen.queryByText("1 new reply")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open (1)" }));
  expect(screen.queryByText("Original feedback")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open (1)" }));
  expect(screen.getByText("Original feedback")).toBeTruthy();
  view.unmount();
  render(<ApostilProvider pageId="home" storage={storage}><Controls /><CommentSidebar /></ApostilProvider>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("List"));
  expect(screen.getByRole("button", { name: "1 reply" })).toBeTruthy();
});

it("keeps the new-comment composer within a narrow screen instead of flipping off its left edge", async () => {
  const originalWidth = window.innerWidth;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(288);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(180);
  try {
    render(<ApostilProvider pageId="mobile" storage={{ load: async () => [], save: async () => {} }}><Controls /><button id="mobile-target">Climate</button><CommentOverlay /></ApostilProvider>);
    await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Comment"));
    fireEvent(screen.getByText("Climate"), new MouseEvent("pointerdown", { bubbles: true, clientX: 110, clientY: 200 }));
    const composer = screen.getByPlaceholderText("What's on your mind?").closest<HTMLElement>('[data-apostil-ui="new-comment"]')!;
    // Its parent is at the pin's x=110, so -98 places the box at x=12.
    expect(composer.style.left).toBe("-98px");
    expect(composer.style.maxWidth).toBe("351px");
    expect(composer.style.visibility).toBe("visible");
  } finally {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  }
});

it("shows a distinct review pin and the agent reply after refreshing an MCP update", async () => {
  const original: ApostilThread = { id: "agent-review", pageId: "home", pinX: 10, pinY: 10, resolved: false, createdAt: "now", comments: [{ id: "original", threadId: "agent-review", author: { id: "user", name: "Reviewer", color: "#2563eb" }, body: "Fix this spacing", createdAt: "now" }] };
  let remote = original;
  const storage = { load: async () => [remote], save: async () => {} };
  render(<ApostilProvider pageId="home" storage={storage}><Controls /><CommentOverlay /><CommentSidebar /></ApostilProvider>);
  const pin = await screen.findByRole("button", { name: "Open comment 1" });
  expect((pin.firstElementChild as HTMLElement).style.backgroundColor).toBe("rgb(37, 99, 235)");
  remote = { ...original, status: "needs_review", comments: [...original.comments, { id: "agent", threadId: original.id, author: { id: "ai", name: "Claude", color: "#171717" }, body: "Adjusted spacing; tests pass.", createdAt: "now", taskUpdate: { status: "needs_review", details: "Check the mobile layout." } }] };
  fireEvent.click(screen.getByText("List"));
  fireEvent.click(screen.getByLabelText("Refresh comments"));
  const reviewPin = await screen.findByRole("button", { name: "Open comment 1 — Needs review" });
  expect((reviewPin.firstElementChild as HTMLElement).style.backgroundColor).toBe("rgb(180, 83, 9)");
  expect((reviewPin.firstElementChild as HTMLElement).style.outline).toBe("3px solid #fde68a");
  expect(screen.getByText("Needs review (1)")).toBeTruthy();
  fireEvent.click(screen.getByText("Fix this spacing"));
  expect(screen.getAllByText("Adjusted spacing; tests pass.").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Check the mobile layout.").length).toBeGreaterThan(0);
});

it("puts a thread back and keeps the reason when storage rejects its deletion", async () => {
  const thread: ApostilThread = { id: "t1", pageId: "home", pinX: 50, pinY: 20, resolved: false, createdAt: "2026-01-01", comments: [{ id: "c1", threadId: "t1", author: { id: "u", name: "Reviewer", color: "red" }, body: "Keep me", createdAt: "2026-01-01" }] };
  const save = vi.fn(async (_page: string, threads: ApostilThread[]) => { if (!threads.length) throw new Error("This thread changed since you loaded it."); });
  function State() {
    const { threads, storageError, addReply, deleteThread } = useApostil();
    return <><p>{threads.length} threads</p><p>{storageError}</p><button onClick={() => addReply("t1", "More")}>Reply</button><button onClick={() => deleteThread("t1")}>Delete</button></>;
  }
  render(<ApostilProvider pageId="home" storage={{ load: async () => [thread], save }}><Controls /><State /></ApostilProvider>);
  await screen.findByText("1 threads");
  fireEvent.click(screen.getByText("Comment"));
  fireEvent.click(screen.getByText("Delete"));
  await screen.findByText("0 threads");
  await screen.findByText("1 threads");
  await waitFor(() => expect(save).toHaveBeenLastCalledWith("home", [thread]));
  expect(screen.getByText("This thread changed since you loaded it.")).toBeTruthy();
  fireEvent.click(screen.getByText("Reply"));
  await waitFor(() => expect(screen.queryByText("This thread changed since you loaded it.")).toBeNull());
});

const author = { id: "u", name: "Reviewer", color: "red" };
const footerThread: ApostilThread = { id: "t1", pageId: "home", targetId: "#footer", targetLabel: "Footer", pinX: 50, pinY: 20, resolved: false, createdAt: "2026-01-01", comments: [{ id: "c1", threadId: "t1", author, body: "Adjust footer spacing", createdAt: "2026-01-01" }] };
const memory = (threads: ApostilThread[]): ApostilStorage => ({ load: async () => threads, save: async () => {} });
function ForceComment() {
  const api = useApostil();
  return <button data-apostil-ui onClick={() => { api.setUser("Alice"); api.setCommentMode(true); }}>Force comment</button>;
}

it("keeps a reply draft and its thread open while the pin's anchor is out of view", async () => {
  render(<ApostilProvider pageId="home" storage={memory([footerThread])}><Controls /><footer id="footer">Page footer</footer><CommentOverlay /></ApostilProvider>);
  const pin = await screen.findByRole("button", { name: "Open comment 1" });
  fireEvent.click(screen.getByText("Comment"));
  fireEvent.click(pin);
  fireEvent.change(await screen.findByPlaceholderText("Reply..."), { target: { value: "Half-written reply" } });
  const footer = document.querySelector("footer")!;
  footer.hidden = true;
  await waitFor(() => expect(screen.queryByRole("button", { name: "Open comment 1" })).toBeNull());
  expect((screen.getByPlaceholderText("Reply...") as HTMLTextAreaElement).value).toBe("Half-written reply");
  expect(screen.getByRole("dialog", { name: "Comment thread on Footer" }).style.visibility).toBe("visible");
  footer.hidden = false;
  await screen.findByRole("button", { name: "Open comment 1" });
  expect((screen.getByPlaceholderText("Reply...") as HTMLTextAreaElement).value).toBe("Half-written reply");
});

it("pulls agent updates when the window regains focus, without re-saving or reporting a flaky pull", async () => {
  let remote = [footerThread];
  let offline = false;
  const load = vi.fn(async () => { if (offline) throw new Error("Offline"); return remote; });
  const save = vi.fn(async (_page: string, _threads: ApostilThread[]) => {});
  function State() {
    const { threads, storageError } = useApostil();
    return <p>{threads[0]?.comments.length} comments, error {storageError ?? "none"}</p>;
  }
  render(<ApostilProvider pageId="home" storage={{ load, save }}><State /></ApostilProvider>);
  await screen.findByText("1 comments, error none");
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  fireEvent.focus(window);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(save).toHaveBeenCalledTimes(1);
  remote = [{ ...footerThread, status: "needs_review", comments: [...footerThread.comments, { id: "agent", threadId: "t1", author: { id: "ai", name: "Claude", color: "black" }, body: "Done", createdAt: "2026-01-02" }] }];
  fireEvent(document, new Event("visibilitychange"));
  await screen.findByText("2 comments, error none");
  await waitFor(() => expect(save).toHaveBeenLastCalledWith("home", remote));
  offline = true;
  fireEvent.focus(window);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
  expect(screen.getByText("2 comments, error none")).toBeTruthy();
});

it("shows the storage error instead of the click hint after a failed load, and does not poll", async () => {
  const load = vi.fn(async () => { throw new Error("Storage is down."); });
  render(<ApostilProvider pageId="home" storage={{ load, save: async () => {} }}><ForceComment /><main id="page">Page</main><CommentOverlay /></ApostilProvider>);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText("Force comment"));
  expect((await screen.findByRole("status")).textContent).toBe("Storage is down.");
  expect(screen.queryByText("Click to comment · Esc to interact with the page")).toBeNull();
  fireEvent.focus(window);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(load).toHaveBeenCalledTimes(1);
});

it("clears a pending pin when comment mode is toggled off or the composer is cancelled", async () => {
  render(<ApostilProvider pageId="home" storage={memory([])}><Controls /><button id="target">Climate</button><CommentOverlay /><CommentToggle /></ApostilProvider>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("Comment"));
  fireEvent.pointerDown(screen.getByText("Climate"), { clientX: 10, clientY: 10 });
  expect(screen.getByPlaceholderText("What's on your mind?")).toBeTruthy();
  fireEvent.click(screen.getByTitle("Exit comment mode"));
  expect(screen.queryByPlaceholderText("What's on your mind?")).toBeNull();
  expect(screen.queryByText("+")).toBeNull();
  fireEvent.click(screen.getByTitle("Add comment"));
  fireEvent.pointerDown(screen.getByText("Climate"), { clientX: 10, clientY: 10 });
  fireEvent.click(screen.getByRole("button", { name: "Cancel comment" }));
  expect(screen.queryByPlaceholderText("What's on your mind?")).toBeNull();
  expect(screen.getByTitle("Add comment")).toBeTruthy();
});

it("moves the sidebar and toggle into a modal host dialog and back, above the pins when asking for a name", async () => {
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) { return selector === ":modal" ? this.hasAttribute("open") : matches.call(this, selector); });
  render(<ApostilProvider pageId="home" storage={memory([footerThread])}><dialog id="host"><p id="footer">In dialog</p></dialog><CommentOverlay /><CommentSidebar /><CommentToggle /></ApostilProvider>);
  const dialog = document.getElementById("host")!;
  const parents = () => ["controls", "sidebar", "overlay"].map(name => document.querySelector(`[data-apostil-ui="${name}"]`)?.parentElement);
  await waitFor(() => expect(parents()).toEqual([document.body, document.body, document.body]));
  dialog.setAttribute("open", "");
  await waitFor(() => expect(parents()).toEqual([dialog, dialog, dialog]));
  const pin = await screen.findByRole("button", { name: "Open comment 1" });
  fireEvent.focus(pin);
  expect(dialog.contains(await screen.findByRole("tooltip"))).toBe(true);
  dialog.removeAttribute("open");
  await waitFor(() => expect(parents()).toEqual([document.body, document.body, document.body]));
  fireEvent.click(screen.getByTitle("Add comment"));
  const prompt = screen.getByText("What's your name?").closest<HTMLElement>('[data-apostil-ui="user-prompt"]')!;
  for (const name of ["controls", "sidebar", "overlay"]) expect(Number(prompt.style.zIndex)).toBeGreaterThan(Number(document.querySelector<HTMLElement>(`[data-apostil-ui="${name}"]`)!.style.zIndex));
});

it("opens a hash-linked thread on hashchange, in the sidebar when its anchor is gone", async () => {
  render(<ApostilProvider pageId="home" storage={memory([{ ...footerThread, targetId: "#missing" }])}><Controls /><CommentOverlay /><CommentSidebar /></ApostilProvider>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  const sidebar = document.querySelector('[data-apostil-ui="sidebar"]')!;
  expect(sidebar.hasAttribute("hidden")).toBe(true);
  window.location.hash = "#apostil-t1";
  await waitFor(() => expect(sidebar.hasAttribute("hidden")).toBe(false));
  expect(screen.getByRole("article", { name: "Comment by Reviewer" }).className).toContain("is-expanded");
  expect(window.location.hash).toBe("");
});

it("labels the thread and sidebar, returns focus on Escape, and closes the task menu from outside", async () => {
  const loadAll = async () => [{ pageId: "my-post", threads: [{ ...footerThread, id: "t2", pageId: "my-post" }] }];
  render(<ApostilProvider pageId="home" storage={{ ...memory([footerThread]), loadAll }}><Controls /><footer id="footer">Page footer</footer><CommentOverlay /><CommentSidebar /></ApostilProvider>);
  const pin = await screen.findByRole("button", { name: "Open comment 1" });
  fireEvent.click(screen.getByText("Comment"));
  fireEvent.keyDown(document.body, { key: "Escape" });
  fireEvent.click(pin);
  const reply = within(await screen.findByRole("dialog", { name: "Comment thread on Footer" })).getByPlaceholderText("Reply...");
  reply.focus();
  fireEvent.keyDown(reply, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(pin);
  expect((await screen.findByRole("tooltip")).textContent).toBe("Footer");

  fireEvent.click(screen.getByText("List"));
  const sidebar = screen.getByRole("complementary", { name: "Comments" });
  expect(document.activeElement).toBe(sidebar);
  const menu = sidebar.querySelector<HTMLDetailsElement>(".apostil-thread-actions")!;
  menu.open = true;
  fireEvent.pointerDown(screen.getByText("Adjust footer spacing"));
  expect(menu.open).toBe(false);
  menu.open = true;
  fireEvent.keyDown(sidebar, { key: "Escape" });
  expect(menu.open).toBe(false);
  expect(sidebar.hasAttribute("hidden")).toBe(false);
  expect(document.activeElement).toBe(menu.querySelector("summary"));
  expect(screen.getByRole("tab", { name: /This Page/ }).getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
  const all = screen.getByRole("tab", { name: "All Pages" });
  expect(all.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(all);
  expect(await screen.findByRole("button", { name: "my-post" })).toBeTruthy();
  fireEvent.keyDown(all, { key: "Escape" });
  expect(sidebar.hasAttribute("hidden")).toBe(true);
});

it("watches the page with one observer however many pins there are, and reads shortcut keys through shadow DOM", async () => {
  const observe = vi.spyOn(MutationObserver.prototype, "observe");
  const threads = ["a", "b", "c"].map(id => ({ ...footerThread, id }));
  render(<ApostilProvider pageId="home" storage={memory(threads)}><footer id="footer">Page footer</footer><div id="shadow" /><CommentOverlay /><CommentToggle /></ApostilProvider>);
  await screen.findByRole("button", { name: "Open comment 3" });
  expect(observe.mock.calls.filter(([, options]) => options?.attributeFilter?.includes("data-state"))).toHaveLength(1);
  const input = document.getElementById("shadow")!.attachShadow({ mode: "open" }).appendChild(document.createElement("input"));
  fireEvent.keyDown(input, { key: "c", composed: true });
  expect(screen.getByTitle("Add comment")).toBeTruthy();
  fireEvent.keyDown(document.body, { key: "c" });
  expect(screen.getByTitle("Exit comment mode")).toBeTruthy();
});
