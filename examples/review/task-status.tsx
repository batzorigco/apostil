import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ApostilProvider, CommentOverlay, CommentSidebar, CommentToggle, useApostil, type ApostilThread } from "../../src";
import "../../dist/styles.css";
import "./style.css";

// Isolated, in-memory examples. No real project feedback is changed.
const reviewer = { id: "demo-user", name: "Reviewer", color: "#6366f1" };
const ai = { id: "demo-ai", name: "Codex", color: "#6366f1" };
const createdAt = new Date().toISOString();
let threads: ApostilThread[] = [
  { id: "contrast", pageId: "task-status-demo", targetId: "#contrast", targetLabel: "Button contrast", pinX: 92, pinY: 30, status: "open", resolved: false, createdAt,
    comments: [{ id: "c1", threadId: "contrast", author: reviewer, body: "Increase the button contrast.", createdAt }] },
  { id: "spacing", pageId: "task-status-demo", targetId: "#spacing", targetLabel: "Card spacing", pinX: 92, pinY: 30, status: "needs_review", resolved: false, createdAt,
    comments: [
      { id: "c2", threadId: "spacing", author: reviewer, body: "Give the card more breathing room.", createdAt },
      { id: "c3", threadId: "spacing", author: ai, body: "Increased the card padding and heading spacing.", createdAt, taskUpdate: { status: "needs_review", details: "Check the visual balance on your phone. Confirm the spacing feels right before completing this task." } },
    ] },
  { id: "label", pageId: "task-status-demo", targetId: "#label", targetLabel: "Button label", pinX: 92, pinY: 30, status: "completed", resolved: true, createdAt,
    comments: [
      { id: "c4", threadId: "label", author: reviewer, body: "Rename the button to Save changes.", createdAt },
      { id: "c5", threadId: "label", author: ai, body: "Updated the label to Save changes.", createdAt, taskUpdate: { status: "completed", details: "Example verification: checked the visible label and accessible name." } },
    ] },
];
const storage = { load: async () => threads, save: async (_page: string, next: ApostilThread[]) => { threads = next; } };
function Demo() {
  const { setSidebarOpen } = useApostil();
  useEffect(() => { setSidebarOpen(true); }, [setSidebarOpen]);
  return <>
    <main style={{ margin: "40px", maxWidth: 620 }}>
      <p className="eyebrow">APOSTIL / TASK STATES</p><h1>Feedback with an outcome.</h1>
      <p>Sample feedback only. Open a task to read the outcome, change its status, or reopen it.</p>
      <section id="contrast"><h2>Button contrast</h2><p>An open task is ready for implementation.</p></section>
      <section id="spacing"><h2>Card spacing</h2><p>The amber pin means a human needs to check the result.</p></section>
      <section id="label"><h2>Button label</h2><button className="demo-button">Save changes</button><p>Completed tasks remain in the sidebar and can be reopened.</p></section>
    </main>
    <CommentOverlay /><CommentSidebar /><CommentToggle />
  </>;
}
createRoot(document.getElementById("root")!).render(<ApostilProvider pageId="task-status-demo" storage={storage}><Demo /></ApostilProvider>);
