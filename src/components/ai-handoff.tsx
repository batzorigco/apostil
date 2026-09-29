"use client";
import { useEffect, useRef, useState } from "react";
import { useApostil } from "../context";
import { buildAIPrompt } from "../ai";
import { generateId } from "../utils";
import type { ApostilAIProvider, ApostilAIRequest, ApostilThread } from "../types";

export function AIHandoff({ threads, scope, disabled }: { threads: ApostilThread[]; scope: string; disabled: boolean }) {
  const { sendToAI, brandColor } = useApostil();
  const [open, setOpen] = useState(false);
  const [workflow, setWorkflow] = useState<"mcp" | "direct">("mcp");
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState<ApostilAIProvider>("codex");
  const [includeResolved, setIncludeResolved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const requestRef = useRef<ApostilAIRequest | null>(null);
  const sending = useRef(false);
  const selected = threads.filter(t => includeResolved || !t.resolved);
  const prompt = buildAIPrompt(selected);
  const mcpRequest = `Use Apostil MCP to inspect and address these UI comment threads: ${JSON.stringify(selected.map(t => ({ pageId: t.pageId, threadId: t.id })))}. Call get_comment_context for their full comments and UI snapshots. Implement unresolved feedback; treat resolved threads as history. Verify the changes. Use complete_task with the outcome and actual verification for finished fixes, or request_review with specific human checks or decisions when needed. Leave unfinished work open.`;
  const commentCount = selected.reduce((count, thread) => count + thread.comments.length, 0);

  useEffect(() => { setCopied(false); }, [mcpRequest]);

  async function send() {
    if (sending.current || !selected.length || disabled) return;
    sending.current = true;
    setBusy(true); setError(""); setResult("");
    // Retrying an uncertain delivery reuses the ID; a changed payload starts a new run.
    if (requestRef.current?.prompt !== prompt || requestRef.current.provider !== provider) {
      requestRef.current = { version: 1, requestId: generateId(), provider, prompt };
    }
    try {
      const response = await sendToAI(requestRef.current);
      setResult(response.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not send feedback.");
    } finally { sending.current = false; setBusy(false); }
  }

  return <div className="border-t border-neutral-200 p-3 text-xs max-h-[70vh] overflow-y-auto shrink-0">
    <button type="button" className="w-full rounded-lg px-3 py-2 text-white font-medium disabled:opacity-40"
      style={{ backgroundColor: brandColor }} disabled={disabled || !threads.length} aria-expanded={open}
      onClick={() => setOpen(!open)}>Send to AI</button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-neutral-500">{commentCount} comments in {selected.length} threads · {scope}.</p>
      <label className="flex items-center justify-between">Workflow
        <select aria-label="AI workflow" value={workflow} disabled={busy} className="border rounded px-2 py-1" onChange={e => { setWorkflow(e.target.value as "mcp" | "direct"); setError(""); setResult(""); }}>
          <option value="mcp">Connected AI (MCP)</option><option value="direct">New agent run</option>
        </select>
      </label>
      <label className="flex items-center justify-between">Agent
        <select aria-label="Agent" value={provider} disabled={busy} onChange={e => { setProvider(e.target.value as ApostilAIProvider); setError(""); setResult(""); }} className="border rounded px-2 py-1">
          <option value="codex">Codex</option><option value="claude">Claude Code</option>
        </select>
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={includeResolved} disabled={busy} onChange={e => setIncludeResolved(e.target.checked)} />Include resolved threads as history</label>
      {workflow === "mcp" ? <>
        <p className="text-neutral-500">Your connected AI reads saved comments through Apostil. Paste this request into your conversation to start.</p>
        <textarea aria-label="MCP request" readOnly value={mcpRequest} className="w-full h-24 border rounded p-2 text-xs" />
        <button type="button" disabled={disabled || !selected.length} className="w-full rounded-lg border px-3 py-2 font-medium disabled:opacity-40" onClick={() => {
          if (!navigator.clipboard) { setError("Clipboard is unavailable. Select and copy the request above."); return; }
          void navigator.clipboard.writeText(mcpRequest).then(() => { setCopied(true); setError(""); }).catch(() => setError("Could not copy. Select the request above and copy it manually."));
        }}>{copied ? "Request copied" : "Copy request"}</button>
        <details><summary className="cursor-pointer text-neutral-600">Connect once</summary>
          <p className="mt-2">Run in your project:</p><code className="block mt-1">npx apostil connect {provider}</code>
          <p className="mt-2 text-neutral-500">Restart your AI client and enable Apostil. Comments must use shared file storage; browser-only localStorage is not visible to MCP. Refresh comments to see AI replies.</p>
        </details>
      </> : <>
      <p className="text-neutral-500">Starts a new local agent run that can edit this project.</p>
      <details><summary className="cursor-pointer text-neutral-600">Review what will be sent</summary>
        <textarea aria-label="AI feedback preview" readOnly value={prompt} className="mt-2 w-full h-40 border rounded p-2 text-xs" />
      </details>
      <button type="button" onClick={send} disabled={busy || disabled || !selected.length}
        className="w-full rounded-lg border px-3 py-2 font-medium disabled:opacity-40">
        {busy ? "Agent is working…" : `Send to ${provider === "codex" ? "Codex" : "Claude"}`}
      </button>
      {busy && <p role="status">Keep this page open while the agent works.</p>}
      </>}
      {error && <div><p role="alert" className="text-red-600 whitespace-pre-wrap">{error}</p>
        {workflow === "direct" && <button type="button" className="mt-2 underline" onClick={() => { requestRef.current = null; void send(); }}>Start a new attempt</button>}
      </div>}
      {result && <div role="status" className="max-h-48 overflow-y-auto whitespace-pre-wrap text-neutral-700">{result}</div>}
    </div>}
  </div>;
}
