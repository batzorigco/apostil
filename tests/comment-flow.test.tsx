import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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

it("sends all-page feedback through the configured sender including replies", async () => {
  const thread: ApostilThread = { id: "t1", pageId: "other", pinX: 0, pinY: 0, resolved: false, createdAt: "now", comments: [{ id: "c1", threadId: "t1", author: { id: "u1", name: "Alice", color: "red" }, body: "Change spacing", createdAt: "now" }] };
  const sender = vi.fn().mockResolvedValue({ message: "Updated spacing and checked the result." });
  const storage: ApostilStorage = { load: async () => [], save: async () => {}, loadAll: async () => [{ pageId: "other", threads: [thread] }] };
  render(<ApostilProvider pageId="home" storage={storage} onSendToAI={sender}><Controls /><CommentSidebar /></ApostilProvider>);
  fireEvent.click(screen.getByText("List"));
  fireEvent.click(screen.getByText("All Pages"));
  await waitFor(() => expect((screen.getByText("Send to AI") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("Send to AI"));
  fireEvent.change(screen.getByLabelText("AI workflow"), { target: { value: "direct" } });
  fireEvent.change(screen.getByLabelText("Agent"), { target: { value: "claude" } });
  fireEvent.click(screen.getByText("Send to Claude"));
  await screen.findByText("Updated spacing and checked the result.");
  expect(sender).toHaveBeenCalledWith(expect.objectContaining({ provider: "claude", prompt: expect.stringContaining("Change spacing") }));
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

it("defaults to the existing-conversation MCP workflow without starting a new agent run", async () => {
  const sender = vi.fn();
  const thread: ApostilThread = { id: "mcp-thread", pageId: "home", pinX: 10, pinY: 20, resolved: false, createdAt: "now", comments: [{ id: "c1", threadId: "mcp-thread", author: { id: "u", name: "Reviewer", color: "red" }, body: "Increase spacing", createdAt: "now" }] };
  render(<ApostilProvider pageId="home" storage={{ load: async () => [thread], save: async () => {} }} onSendToAI={sender}><Controls /><CommentSidebar /></ApostilProvider>);
  await waitFor(() => expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("List"));
  fireEvent.click(screen.getByText("Send to AI"));
  expect((screen.getByLabelText("AI workflow") as HTMLSelectElement).value).toBe("mcp");
  expect((screen.getByLabelText("MCP request") as HTMLTextAreaElement).value).toContain("mcp-thread");
  expect(sender).not.toHaveBeenCalled();
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
