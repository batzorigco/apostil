/**
 * Generates the dashboard HTML that shows all comments across the project.
 * Accessible at http://localhost:{port}/dashboard
 */
export function getDashboardHTML(port: number, project: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Remarq — ${project}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fafafa; color: #1a1a1a; }
    .header { background: white; border-bottom: 1px solid #e5e5e5; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
    .header h1 { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
    .header .project { font-size: 12px; color: #888; background: #f5f5f5; padding: 4px 10px; border-radius: 6px; }
    .stats { display: flex; gap: 24px; padding: 20px 24px; background: white; border-bottom: 1px solid #e5e5e5; }
    .stat { display: flex; flex-direction: column; gap: 2px; }
    .stat-value { font-size: 24px; font-weight: 700; }
    .stat-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .pages { padding: 16px 24px; display: flex; flex-direction: column; gap: 12px; }
    .page-card { background: white; border: 1px solid #e5e5e5; border-radius: 12px; overflow: hidden; }
    .page-header { padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
    .page-header:hover { background: #fafafa; }
    .page-url { font-size: 13px; font-weight: 600; color: #1a1a1a; }
    .page-badge { font-size: 11px; background: #f0f0f0; color: #666; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
    .page-badge.open { background: #fef2f2; color: #dc2626; }
    .threads { border-top: 1px solid #f0f0f0; }
    .thread { padding: 12px 18px; border-bottom: 1px solid #f8f8f8; display: flex; gap: 10px; cursor: pointer; transition: background 0.15s; }
    .thread:hover { background: #f9f9f9; }
    .thread:last-child { border-bottom: none; }
    .thread-pin { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: 600; flex-shrink: 0; }
    .thread-content { flex: 1; min-width: 0; }
    .thread-author { font-size: 11px; font-weight: 600; color: #555; }
    .thread-body { font-size: 13px; color: #333; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .thread-meta { font-size: 10px; color: #aaa; margin-top: 4px; display: flex; gap: 8px; }
    .thread-target { font-size: 10px; background: #eff6ff; color: #3b82f6; padding: 1px 6px; border-radius: 4px; }
    .resolved { opacity: 0.5; }
    .empty { padding: 60px 24px; text-align: center; color: #aaa; }
    .empty-icon { font-size: 40px; margin-bottom: 12px; }
    .empty-text { font-size: 14px; }
    .loading { padding: 60px 24px; text-align: center; color: #aaa; font-size: 14px; }
    a { color: inherit; text-decoration: none; }
    .nav-link { font-size: 12px; color: #3b82f6; }
    .nav-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <h1>remarq</h1>
    <span class="project">${project}</span>
  </div>
  <div class="stats" id="stats">
    <div class="stat"><span class="stat-value" id="stat-pages">-</span><span class="stat-label">Pages</span></div>
    <div class="stat"><span class="stat-value" id="stat-open">-</span><span class="stat-label">Open</span></div>
    <div class="stat"><span class="stat-value" id="stat-resolved">-</span><span class="stat-label">Resolved</span></div>
    <div class="stat"><span class="stat-value" id="stat-total">-</span><span class="stat-label">Total</span></div>
  </div>
  <div class="pages" id="pages">
    <div class="loading">Loading comments...</div>
  </div>

  <script>
    const API = "http://localhost:${port}";

    function timeAgo(iso) {
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return mins + "m ago";
      const hours = Math.floor(mins / 60);
      if (hours < 24) return hours + "h ago";
      const days = Math.floor(hours / 24);
      return days + "d ago";
    }

    function pageIdToUrl(pageId) {
      // Convert "batzorig-co--about" back to "batzorig.co/about"
      return pageId.replace(/--/g, "/").replace(/-co\\//g, ".co/").replace(/-com\\//g, ".com/").replace(/-io\\//g, ".io/");
    }

    function pageIdToPath(pageId) {
      const url = pageIdToUrl(pageId);
      // Try to extract just the path
      const parts = url.split("/");
      if (parts.length > 1) return "/" + parts.slice(1).join("/");
      return "/";
    }

    async function loadAllComments() {
      try {
        const res = await fetch(API + "/api/all-comments");
        const data = await res.json();
        renderDashboard(data);
      } catch (e) {
        document.getElementById("pages").innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">Could not connect to remarq server</div></div>';
      }
    }

    function renderDashboard(pages) {
      let totalOpen = 0;
      let totalResolved = 0;
      let totalThreads = 0;

      const container = document.getElementById("pages");

      if (pages.length === 0) {
        container.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">No comments yet. Press C on any page to start.</div></div>';
        return;
      }

      let html = "";
      for (const page of pages) {
        const open = page.threads.filter(t => !t.resolved).length;
        const resolved = page.threads.filter(t => t.resolved).length;
        totalOpen += open;
        totalResolved += resolved;
        totalThreads += page.threads.length;

        const displayUrl = pageIdToUrl(page.pageId);
        const pagePath = pageIdToPath(page.pageId);

        html += '<div class="page-card">';
        html += '<div class="page-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === \\'none\\' ? \\'block\\' : \\'none\\'">';
        html += '<div style="display:flex;align-items:center;gap:8px;"><span class="page-url">' + displayUrl + '</span>';
        if (open > 0) html += '<span class="page-badge open">' + open + ' open</span>';
        if (resolved > 0) html += '<span class="page-badge">' + resolved + ' resolved</span>';
        html += '</div>';
        html += '<span style="font-size:18px;color:#ccc;">›</span>';
        html += '</div>';
        html += '<div class="threads">';

        // Sort: open first, then by date
        const sorted = [...page.threads].sort((a, b) => {
          if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        for (const thread of sorted) {
          const first = thread.comments[0];
          if (!first) continue;
          const replyCount = thread.comments.length - 1;

          html += '<div class="thread ' + (thread.resolved ? "resolved" : "") + '" onclick="navigateToComment(\\'' + page.pageId + '\\', \\'' + thread.id + '\\')">';
          html += '<div class="thread-pin" style="background:' + first.author.color + '">' + first.author.name[0].toUpperCase() + '</div>';
          html += '<div class="thread-content">';
          html += '<div class="thread-author">' + first.author.name + '</div>';
          html += '<div class="thread-body">' + first.body.replace(/</g, "&lt;") + '</div>';
          html += '<div class="thread-meta">';
          html += '<span>' + timeAgo(first.createdAt) + '</span>';
          if (replyCount > 0) html += '<span>' + replyCount + ' ' + (replyCount === 1 ? "reply" : "replies") + '</span>';
          if (thread.targetLabel) html += '<span class="thread-target">' + thread.targetLabel + '</span>';
          if (thread.resolved) html += '<span style="color:#10b981;">✓ Resolved</span>';
          html += '</div></div></div>';
        }

        html += '</div></div>';
      }

      container.innerHTML = html;

      document.getElementById("stat-pages").textContent = pages.length;
      document.getElementById("stat-open").textContent = totalOpen;
      document.getElementById("stat-resolved").textContent = totalResolved;
      document.getElementById("stat-total").textContent = totalThreads;
    }

    function navigateToComment(pageId, threadId) {
      // Try to determine the actual URL from the pageId
      const url = pageIdToUrl(pageId);
      // Open the page with a hash to highlight the comment
      const protocol = url.includes("localhost") ? "http://" : "https://";
      const fullUrl = (url.startsWith("http") ? url : protocol + url) + "#remarq-" + threadId;
      window.open(fullUrl, "_blank");
    }

    loadAllComments();
    // Auto-refresh every 10 seconds
    setInterval(loadAllComments, 10000);
  </script>
</body>
</html>`;
}
