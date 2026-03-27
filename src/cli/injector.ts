/**
 * Generates the JavaScript that gets injected into the user's page.
 * This script creates a floating comment overlay without React —
 * it's a lightweight vanilla JS implementation for the CLI mode.
 */
export function getInjectorScript(port: number): string {
  return `
(function() {
  if (window.__remarq_loaded) return;
  window.__remarq_loaded = true;

  const API = "http://localhost:${port}/api/comments";
  const pageId = location.hostname + location.pathname.replace(/\\//g, "--").replace(/^--/, "");

  let threads = [];
  let user = null;
  let commentMode = false;
  let activeThread = null;

  // Load user from localStorage
  try {
    const saved = localStorage.getItem("remarq-user");
    if (saved) user = JSON.parse(saved);
  } catch {}

  // Load threads
  async function loadThreads() {
    try {
      const res = await fetch(API + "?pageId=" + encodeURIComponent(pageId));
      threads = await res.json();
      renderPins();
    } catch {}
  }

  async function saveThreads() {
    try {
      await fetch(API + "?pageId=" + encodeURIComponent(pageId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(threads),
      });
    } catch {}
  }

  function genId() {
    return Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  }

  // Create overlay container
  const container = document.createElement("div");
  container.id = "remarq-overlay";
  container.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:999999;font-family:system-ui,-apple-system,sans-serif;";
  document.body.appendChild(container);

  // Toggle button
  const toggleBtn = document.createElement("button");
  toggleBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  toggleBtn.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:1000000;width:48px;height:48px;border-radius:50%;border:1px solid #e5e5e5;background:white;color:#555;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:all 0.2s;";
  toggleBtn.onmouseenter = () => { toggleBtn.style.transform = "scale(1.05)"; };
  toggleBtn.onmouseleave = () => { toggleBtn.style.transform = "scale(1)"; };
  toggleBtn.onclick = () => {
    commentMode = !commentMode;
    toggleBtn.style.background = commentMode ? "#1a1a1a" : "white";
    toggleBtn.style.color = commentMode ? "white" : "#555";
    container.style.pointerEvents = commentMode ? "auto" : "none";
    container.style.cursor = commentMode ? "crosshair" : "default";
    if (commentMode) showHint();
    else hideHint();
  };
  document.body.appendChild(toggleBtn);

  // Badge
  const badge = document.createElement("span");
  badge.style.cssText = "position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;border-radius:9px;background:#ef4444;color:white;font-size:10px;font-weight:600;display:none;align-items:center;justify-content:center;padding:0 4px;";
  toggleBtn.appendChild(badge);

  function updateBadge() {
    const count = threads.filter(t => !t.resolved).length;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? "flex" : "none";
  }

  // Hint
  let hintEl = null;
  function showHint() {
    if (hintEl) return;
    hintEl = document.createElement("div");
    hintEl.textContent = "Click anywhere to add a comment";
    hintEl.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:white;padding:8px 16px;border-radius:20px;font-size:13px;pointer-events:none;z-index:1000000;";
    document.body.appendChild(hintEl);
  }
  function hideHint() {
    if (hintEl) { hintEl.remove(); hintEl = null; }
  }

  // Click to add comment
  container.onclick = (e) => {
    if (!commentMode) return;
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;

    if (!user) {
      const name = prompt("What's your name?");
      if (!name) return;
      user = { id: genId(), name, color: "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6,"0") };
      localStorage.setItem("remarq-user", JSON.stringify(user));
    }

    const body = prompt("Add a comment:");
    if (!body) return;

    const threadId = genId();
    threads.push({
      id: threadId,
      pageId,
      pinX: x, pinY: y,
      resolved: false,
      createdAt: new Date().toISOString(),
      comments: [{ id: genId(), threadId, author: user, body, createdAt: new Date().toISOString() }],
    });

    commentMode = false;
    toggleBtn.style.background = "white";
    toggleBtn.style.color = "#555";
    container.style.pointerEvents = "none";
    container.style.cursor = "default";
    hideHint();

    saveThreads();
    renderPins();
  };

  // Render pins
  function renderPins() {
    container.querySelectorAll(".remarq-pin").forEach(el => el.remove());
    threads.forEach((thread, i) => {
      if (thread.resolved) return;
      const pin = document.createElement("div");
      pin.className = "remarq-pin";
      const color = thread.comments[0]?.author?.color || "#df461c";
      pin.style.cssText = "position:fixed;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:600;cursor:pointer;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.2);transform:translate(-50%,-50%);transition:transform 0.15s;z-index:1000001;background:" + color + ";left:" + thread.pinX + "%;top:" + thread.pinY + "%;";
      pin.textContent = String(i + 1);
      pin.onmouseenter = () => { pin.style.transform = "translate(-50%,-50%) scale(1.15)"; };
      pin.onmouseleave = () => { pin.style.transform = "translate(-50%,-50%)"; };
      pin.onclick = (e) => {
        e.stopPropagation();
        showThread(thread, pin);
      };
      container.appendChild(pin);
    });
    updateBadge();
  }

  // Thread popover
  function showThread(thread, pinEl) {
    container.querySelectorAll(".remarq-popover").forEach(el => el.remove());
    const pop = document.createElement("div");
    pop.className = "remarq-popover";
    const rect = pinEl.getBoundingClientRect();
    pop.style.cssText = "position:fixed;left:" + (rect.right + 12) + "px;top:" + rect.top + "px;width:280px;background:white;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12);border:1px solid #e5e5e5;pointer-events:auto;z-index:1000002;overflow:hidden;";

    let html = '<div style="padding:10px 14px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:11px;color:#888;">' + thread.comments.length + ' comment' + (thread.comments.length > 1 ? "s" : "") + '</span><div>';
    html += '<button class="remarq-resolve" style="background:none;border:none;cursor:pointer;padding:2px;color:#10b981;font-size:14px;" title="Resolve">✓</button>';
    html += '<button class="remarq-delete" style="background:none;border:none;cursor:pointer;padding:2px;color:#999;font-size:14px;" title="Delete">✕</button>';
    html += '</div></div>';

    thread.comments.forEach(c => {
      html += '<div style="padding:10px 14px;border-bottom:1px solid #fafafa;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><div style="width:18px;height:18px;border-radius:50%;background:' + c.author.color + ';color:white;font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:600;">' + c.author.name[0].toUpperCase() + '</div><span style="font-size:11px;font-weight:500;">' + c.author.name + '</span></div><p style="font-size:13px;color:#333;margin:0;line-height:1.4;">' + c.body.replace(/</g,"&lt;") + '</p></div>';
    });

    html += '<div style="padding:8px 10px;border-top:1px solid #f0f0f0;display:flex;gap:6px;"><input class="remarq-reply" placeholder="Reply..." style="flex:1;border:1px solid #e5e5e5;border-radius:6px;padding:6px 10px;font-size:12px;outline:none;" /><button class="remarq-send" style="background:#1a1a1a;color:white;border:none;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;">Send</button></div>';

    pop.innerHTML = html;
    container.appendChild(pop);

    // Keep within viewport
    const popRect = pop.getBoundingClientRect();
    if (popRect.bottom > window.innerHeight - 12) {
      pop.style.top = (window.innerHeight - popRect.height - 12) + "px";
    }

    pop.querySelector(".remarq-resolve").onclick = () => {
      thread.resolved = !thread.resolved;
      pop.remove();
      saveThreads();
      renderPins();
    };

    pop.querySelector(".remarq-delete").onclick = () => {
      threads = threads.filter(t => t.id !== thread.id);
      pop.remove();
      saveThreads();
      renderPins();
    };

    const input = pop.querySelector(".remarq-reply");
    const sendBtn = pop.querySelector(".remarq-send");
    function sendReply() {
      if (!input.value.trim() || !user) return;
      thread.comments.push({ id: genId(), threadId: thread.id, author: user, body: input.value.trim(), createdAt: new Date().toISOString() });
      input.value = "";
      pop.remove();
      saveThreads();
      showThread(thread, pinEl);
    }
    sendBtn.onclick = sendReply;
    input.onkeydown = (e) => { if (e.key === "Enter") sendReply(); };
    input.focus();

    // Close on outside click
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!pop.contains(e.target) && e.target !== pinEl) {
          pop.remove();
          document.removeEventListener("mousedown", closeHandler);
        }
      };
      document.addEventListener("mousedown", closeHandler);
    }, 0);
  }

  // Keyboard shortcut
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "c" || e.key === "C") {
      toggleBtn.click();
    } else if (e.key === "Escape") {
      if (commentMode) toggleBtn.click();
      container.querySelectorAll(".remarq-popover").forEach(el => el.remove());
    }
  });

  // Check for #remarq-{threadId} hash to auto-open a thread
  function checkHash() {
    const hash = location.hash;
    if (hash.startsWith("#remarq-")) {
      const threadId = hash.slice(8);
      setTimeout(() => {
        const thread = threads.find(t => t.id === threadId);
        if (thread) {
          const pin = container.querySelector('.remarq-pin');
          // Find the correct pin
          const pins = container.querySelectorAll('.remarq-pin');
          const openThreads = threads.filter(t => !t.resolved);
          const idx = openThreads.findIndex(t => t.id === threadId);
          if (idx >= 0 && pins[idx]) {
            showThread(thread, pins[idx]);
            // Scroll pin into view if needed
            pins[idx].scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }, 500);
    }
  }

  // Load on start
  loadThreads().then(checkHash);
  window.addEventListener("hashchange", checkHash);

  console.log("[remarq] loaded — press C to comment");
})();
`;
}
