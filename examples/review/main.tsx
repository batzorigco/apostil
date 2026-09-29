import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ApostilProvider, CommentOverlay, CommentSidebar, CommentToggle, useApostil } from "../../src";
import { importLocalComments } from "../../src/adapters/localStorage";
import { createRestAdapter } from "../../src/adapters/rest";
const sharedStorage = createRestAdapter("/api/apostil");
import "../../dist/styles.css";
import "./style.css";

function ImportBrowserComments() {
  const { refreshThreads } = useApostil();
  const [message, setMessage] = useState("");
  return <div><button className="demo-button" onClick={() => {
    void importLocalComments(sharedStorage).then(async result => { await refreshThreads(); setMessage(`Imported ${result.threads} threads. Browser copies are preserved.`); }).catch(error => setMessage(error.message));
  }}>Import browser comments</button><p role="status">{message}</p></div>;
}

function Demo() {
  const dialog = useRef<HTMLDialogElement>(null);
  return <ApostilProvider pageId="review-demo" storage={sharedStorage}>
    <main>
      <p className="eyebrow">APOSTIL / INTERACTION DEMO</p>
      <h1>Feedback, in context.</h1>
      <p>Open a surface, press C, and click an element to comment. Press Escape to return to browsing.</p>
      <section data-comment-target="workspace-card" data-comment-label="Workspace settings">
        <h2>Workspace settings</h2><p>Try comments on the page, inside a native dialog, and inside a nested popover.</p>
        <button className="demo-button" aria-controls="settings-dialog" onClick={() => dialog.current?.showModal()}>Open settings</button>
      </section>
      <p>Connect your AI with <code>node bin/apostil.js connect codex</code> or <code>node bin/apostil.js connect claude</code>, then ask it to address your Apostil comments.</p>
      <ImportBrowserComments />
    </main>
    <dialog ref={dialog} id="settings-dialog" aria-label="Workspace settings">
      <h2>Workspace settings</h2><p>Comment on a control without activating it.</p>
      <button className="demo-button" data-comment-target="save-settings" data-comment-source="examples/review/main.tsx" onClick={() => dialog.current?.close()}>Save settings</button>{" "}
      <button className="demo-button" popoverTarget="more-actions" aria-controls="more-actions">More actions</button>{" "}
      <button className="demo-button" onClick={() => dialog.current?.close()}>Close settings</button>
      <div id="more-actions" popover="auto" aria-label="More actions">
        <h3>More actions</h3><button className="demo-button" data-comment-target="rename-workspace">Rename workspace</button>
      </div>
    </dialog>
    <CommentOverlay /><CommentSidebar /><CommentToggle />
  </ApostilProvider>;
}
createRoot(document.getElementById("root")!).render(<Demo />);
