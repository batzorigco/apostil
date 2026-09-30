"use client";

import { useEffect, useState } from "react";

type Status = { running: boolean; port: number; url: string; clients: { name: string; lastSeen: string }[]; error?: string; message?: string };

export function MCPSettings({ endpoint }: { endpoint?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<Status>();
  const [port, setPort] = useState("3846");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState(false);
  const local = typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const url = local && endpoint ? new URL(endpoint, window.location.href) : undefined;
  const safeEndpoint = local && url?.origin === window.location.origin ? url?.href : undefined;

  useEffect(() => {
    if (!safeEndpoint) return;
    const abort = new AbortController();
    let first = true;
    const check = async () => {
      try {
        const response = await fetch(safeEndpoint, { headers: { "X-Apostil-MCP": "1" }, cache: "no-store", signal: abort.signal });
        if (response.status === 404 || response.status === 403) { setAvailable(false); return; }
        if (!response.ok) throw new Error("Could not reach the MCP controls.");
        const next: Status = await response.json();
        if (typeof next.running !== "boolean" || !Array.isArray(next.clients)) { setAvailable(false); return; }
        setAvailable(true); setStatus(next);
        if (first) { setPort(String(next.port)); first = false; }
      } catch { if (!abort.signal.aborted) { setAvailable(false); setStatus(undefined); } }
    };
    void check();
    const timer = setInterval(() => { if (!document.hidden) void check(); }, 5000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [safeEndpoint]);

  if (!local) return null;
  const act = async (action: string, client?: string) => {
    if (!safeEndpoint) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(safeEndpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Apostil-MCP": "1" }, body: JSON.stringify({ action, port: Number(port), client }) });
      const next: Status = await response.json();
      if (!response.ok) throw new Error(next.error || "MCP setup failed.");
      setStatus(next); setPort(String(next.port)); setMessage(next.message || "");
    } catch (error) { setError(error instanceof Error ? error.message : "MCP setup failed."); }
    finally { setBusy(false); }
  };
  const button = "px-2 py-1.5 rounded border border-neutral-200 text-xs hover:bg-neutral-50 disabled:opacity-50";
  return <div role="region" className="border-t border-neutral-200 text-xs text-neutral-600" aria-label="MCP connection">
    <button type="button" aria-expanded={expanded} style={{ border: 0, background: "transparent", font: "inherit", cursor: "pointer" }} onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between px-4 py-3">
      <span className="font-semibold text-neutral-900">MCP</span>
      <span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${available && status?.running ? "bg-green-500" : "bg-neutral-300"}`} />{!available ? "Setup" : status?.running ? "Running" : "Stopped"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></span>
    </button>
    {expanded && <div className="px-4 pb-4 space-y-3" style={{ maxHeight: "50vh", overflowY: "auto" }}>
      {!available ? <p>{endpoint ? "MCP controls are unavailable. Run the updated Next.js or Vite storage adapter in local development." : "MCP needs shared file storage. Use the Next.js adapter, or the Vite storage plugin with the REST adapter."}</p> : <>
        <div className="flex items-end gap-2">
          <label className="flex-1">Port<input aria-label="MCP port" type="number" min={1024} max={65535} value={port} disabled={busy || status?.running} onChange={e => setPort(e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5 text-neutral-900 disabled:opacity-50" /></label>
          <button type="button" disabled={busy} onClick={() => void act(status?.running ? "stop" : "start")} className={button} style={{ font: "inherit", background: "white", borderStyle: "solid", cursor: "pointer" }}>{busy ? "Working…" : status?.running ? "Stop MCP" : "Start MCP"}</button>
        </div>
        <p>Settings are saved for this project. MCP runs with your dev server.</p>
        {status?.running && <>
          <div className="flex items-center gap-2"><code className="flex-1 break-all">{status.url}</code><button type="button" className={button} style={{ font: "inherit", background: "white", borderStyle: "solid", cursor: "pointer" }} onClick={() => void navigator.clipboard.writeText(status.url).then(() => setMessage("URL copied. It works with local MCP clients."), () => setError("Could not copy. Select the URL above."))}>Copy URL</button></div>
          <p className="font-medium text-neutral-900">Connect an AI</p>
          <div className="flex gap-2"><button type="button" disabled={busy} className={button} style={{ font: "inherit", background: "white", borderStyle: "solid", cursor: "pointer" }} onClick={() => void act("connect", "claude")}>Set up Claude Code</button><button type="button" disabled={busy} className={button} style={{ font: "inherit", background: "white", borderStyle: "solid", cursor: "pointer" }} onClick={() => void act("connect", "codex")}>Set up Codex</button></div>
          <p>Saves this project’s connection. Restart your AI client after setup or a port change, then ask it to review your Apostil comments.</p>
          {status.clients.length ? <ul className="space-y-1">{status.clients.map((client, index) => <li key={index}><span className="font-medium text-neutral-900">{client.name}</span> · Last seen {new Date(client.lastSeen).toLocaleTimeString()}</li>)}</ul> : <p>Waiting for an AI client to connect.</p>}
        </>}
      </>}
      {(error || status?.error) && <p role="alert" className="text-red-600">{error || status?.error}</p>}
      {message && <p role="status">{message}</p>}
    </div>}
  </div>;
}
