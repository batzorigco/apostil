import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type { ApostilPage, ApostilThread, ApostilTaskUpdate } from "../types";
import { getTaskStatus } from "../task-status";
import { isDeepStrictEqual } from "node:util";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const STALE_LOCK_MS = 10_000;
/** Author id prefix reserved for replies created by CommentStore.reply. */
export const AGENT_AUTHOR_PREFIX = "apostil-mcp:";
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
const validElement = (e: any) => !!e && typeof e.selector === "string" && typeof e.tag === "string";
// Fields may be absent in older files, but whatever is present must have the shape readers dereference.
const validContext = (c: any) => !!c && typeof c === "object" && !Array.isArray(c) &&
  ["element", "anchor"].every(key => c[key] === undefined || validElement(c[key])) &&
  (c.surfaces === undefined || (Array.isArray(c.surfaces) && c.surfaces.every((s: any) => !!s && typeof s.kind === "string" && validElement(s.element) && (s.trigger === undefined || validElement(s.trigger)))));

export function validateThreads(value: unknown, pageId?: string): asserts value is ApostilThread[] {
  if (!Array.isArray(value) || value.some(t => !t || typeof t.id !== "string" || !t.id ||
    typeof t.pageId !== "string" || (pageId !== undefined && t.pageId !== pageId) ||
    typeof t.resolved !== "boolean" || !Number.isFinite(t.pinX) || !Number.isFinite(t.pinY) ||
    (t.status !== undefined && !["open", "needs_review", "completed"].includes(t.status)) ||
    (t.context !== undefined && !validContext(t.context)) ||
    typeof t.createdAt !== "string" || !Array.isArray(t.comments) || t.comments.some((c: unknown) => {
      const comment = c as ApostilThread["comments"][number];
      return !comment || typeof comment.id !== "string" || comment.threadId !== t.id ||
        typeof comment.body !== "string" || typeof comment.createdAt !== "string" ||
        (comment.taskUpdate !== undefined && (!comment.taskUpdate || !["completed", "needs_review"].includes(comment.taskUpdate.status) || typeof comment.taskUpdate.details !== "string" || !comment.taskUpdate.details.trim())) ||
        !comment.author || typeof comment.author.name !== "string" || typeof comment.author.id !== "string" || typeof comment.author.color !== "string";
    }))) throw new Error("Invalid comment data. Existing files have not been changed.");
  if (new Set(value.map(t => t.id)).size !== value.length) throw new Error("Duplicate thread IDs in page.");
}

/** One shared store for MCP and app routes. No arbitrary file paths are accepted by tools. */
export class CommentStore {
  readonly directory: string;
  constructor(readonly project: string, directory = ".apostil") {
    const root = path.resolve(project);
    this.directory = path.resolve(root, directory);
    const relative = path.relative(root, this.directory);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Comment directory must be inside the project.");
  }

  async ensureDirectory(create = false) {
    const root = await fs.realpath(this.project);
    const relative = path.relative(path.resolve(this.project), this.directory);
    let current = root;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      if (create) await fs.mkdir(current).catch(error => { if (error.code !== "EEXIST") throw error; });
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Comment directories must not be symlinks or files.");
      } catch (error) { if (!create && missing(error)) return false; throw error; }
    }
    return true;
  }

  private names(pageId: string) {
    if (!pageId || pageId.length > 512) throw new Error("Invalid page ID.");
    // 0.2.0 file names, kept so existing files stay readable: punctuation-only and non-ASCII IDs (including "/") are stored in .json.
    const name = pageId.replace(/[^a-zA-Z0-9_-]/g, "");
    return [`${name}.json`, `${name}-${createHash("sha256").update(pageId).digest("hex").slice(0, 8)}.json`].map(file => path.join(this.directory, file));
  }

  private async readFile(file: string): Promise<ApostilThread[]> {
    let handle;
    try {
      if ((await fs.lstat(file)).isSymbolicLink()) throw new Error("Comment files must not be symlinks.");
      handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_FILE_SIZE) throw new Error("Invalid or oversized comment file.");
      const data = JSON.parse(await handle.readFile("utf8"));
      validateThreads(data);
      return data;
    } catch (error) {
      if (missing(error)) return [];
      throw new Error(`${path.basename(file)}: ${error instanceof Error ? error.message : "unreadable"}`);
    } finally { await handle?.close(); }
  }

  // The legacy name belongs to whichever page stored threads in it first; a different page whose ID sanitises
  // to the same name lives in the hashed file, and stays there even after the legacy file empties.
  private async read(pageId: string) {
    const [legacy, hashed] = this.names(pageId);
    let file = legacy, threads = await this.readFile(legacy);
    if (threads.length ? threads[0].pageId !== pageId : await fs.lstat(hashed).then(() => true, () => false)) threads = await this.readFile(file = hashed);
    if (threads.some(t => t.pageId !== pageId)) throw new Error(`Page ID collides with another stored page in ${path.basename(file)}.`);
    return { file, threads };
  }

  async load(pageId: string): Promise<ApostilThread[]> {
    this.names(pageId);
    return await this.ensureDirectory() ? (await this.read(pageId)).threads : [];
  }

  /** A corrupt or inconsistent file is left out and described in `skipped` so the other pages still list. */
  async loadAll(skipped: string[] = []): Promise<ApostilPage[]> {
    if (!await this.ensureDirectory()) return [];
    const files = (await fs.readdir(this.directory)).filter(file => /^[\w-]*\.json$/.test(file)).sort();
    const pages: ApostilPage[] = [];
    for (const file of files) {
      try {
        const threads = await this.readFile(path.join(this.directory, file));
        if (!threads.length) continue;
        const pageId = threads[0].pageId;
        if (threads.some(t => t.pageId !== pageId) || !this.names(pageId).some(name => path.basename(name) === file)) throw new Error("inconsistent page data.");
        pages.push({ pageId, threads });
      } catch (error) { const { message } = error as Error; skipped.push(message.startsWith(file) ? message : `${file}: ${message}`); }
    }
    const latest = (page: ApostilPage) => Math.max(...page.threads.map(t => Date.parse(t.createdAt) || 0));
    return pages.sort((a, b) => latest(b) - latest(a));
  }

  private async update(pageId: string, change: (threads: ApostilThread[]) => ApostilThread[]) {
    await this.ensureDirectory(true);
    // Pages sharing a sanitised name share this lock, so choosing between the legacy and hashed file cannot race.
    const lock = `${this.names(pageId)[0]}.lock`;
    const deadline = Date.now() + 3000;
    while (true) {
      try { await fs.mkdir(lock); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        // A writer that crashed never removes its lock. Writes take milliseconds, so an old lock has no live owner.
        const age = await fs.stat(lock).then(stat => Date.now() - stat.mtimeMs, () => 0);
        if (age > STALE_LOCK_MS) { await fs.rmdir(lock).catch(() => {}); continue; }
        if (Date.now() >= deadline) throw new Error(`Comments are locked. Retry; a lock left by a crashed writer clears itself after ${STALE_LOCK_MS / 1000} seconds.`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    let temporary: string | undefined;
    try {
      const { file, threads } = await this.read(pageId);
      temporary = `${file}.${randomUUID()}.tmp`;
      const next = change(threads);
      validateThreads(next, pageId);
      const data = JSON.stringify(next, null, 2);
      if (Buffer.byteLength(data) > MAX_FILE_SIZE) throw new Error("Comments exceed the 8 MB page limit.");
      await fs.writeFile(temporary, data, { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, file);
      return next;
    } finally {
      try { if (temporary) await fs.unlink(temporary).catch(error => { if (!missing(error)) throw error; }); }
      finally { await fs.rmdir(lock); }
    }
  }

  async save(pageId: string, incoming: ApostilThread[], base?: ApostilThread[]) {
    validateThreads(incoming, pageId);
    if (base) validateThreads(base, pageId);
    return this.update(pageId, current => {
      const baseline = new Map(base?.map(t => [t.id, t]));
      const submitted = new Map(incoming.map(t => [t.id, t]));
      const existing = new Map(current.map(t => [t.id, t]));
      if (!base) {
        // A legacy client supplies no read baseline. Missing threads could be a
        // stale list, and missing replies could include a newer AI task update.
        // Reject the whole write instead of silently deleting or reopening work.
        for (const prior of current) {
          const next = submitted.get(prior.id);
          if (!next) throw new Error("Deleting comments requires an updated Apostil client. Reload the app after upgrading.");
          if (prior.comments.some(comment => !next.comments.some(c => c.id === comment.id && isDeepStrictEqual(c, comment)))) {
            throw new Error("Comments changed since this client loaded them. Refresh comments before saving.");
          }
          if (next.resolved !== prior.resolved || (next.status !== undefined && getTaskStatus(next) !== getTaskStatus(prior))) {
            throw new Error("Changing task status requires an updated Apostil client. Reload the app after upgrading.");
          }
        }
      }
      const result = incoming.flatMap(t => {
        const prior = existing.get(t.id);
        const original = baseline.get(t.id);
        // A stale tab must not resurrect a thread deleted by another reviewer.
        if (base && original && !prior) return [];
        if (!prior) return [t];
        const comments = [...prior.comments, ...t.comments.filter(c => !prior.comments.some(p => p.id === c.id))];
        const unchangedStatus = original ? getTaskStatus(t) === getTaskStatus(original)
          : t.status === undefined && t.resolved === prior.resolved;
        const status = unchangedStatus ? getTaskStatus(prior) : getTaskStatus(t);
        return [{ ...prior, ...t, comments, status, resolved: status === "completed" }];
      });
      if (base) for (const t of current) {
        if (submitted.has(t.id)) continue;
        const original = baseline.get(t.id);
        if (!original) result.push(t);
        // The merge above stores a derived status the browser's copy may lack, so compare content, not serialized form.
        else if (!isDeepStrictEqual({ ...original, status: getTaskStatus(original) }, { ...t, status: getTaskStatus(t) })) throw new Error("This thread changed since you loaded it. Refresh before deleting it.");
      }
      return result;
    });
  }

  async reply(pageId: string, threadId: string, body: string, requestId: string, author: string, taskUpdate?: ApostilTaskUpdate) {
    const id = `mcp-${createHash("sha256").update(`${threadId}:${requestId}`).digest("hex").slice(0, 32)}`;
    const threads = await this.update(pageId, current => {
      const thread = current.find(t => t.id === threadId);
      if (!thread) throw new Error("Comment thread not found on this page.");
      const existing = thread.comments.find(c => c.id === id);
      if (existing) {
        if (existing.body !== body || existing.author.name !== author ||
          existing.taskUpdate?.status !== taskUpdate?.status || existing.taskUpdate?.details !== taskUpdate?.details) throw new Error("Request ID already used for a different reply or task update.");
        // A retry must not reapply an old status after a reviewer reopens the task.
        return current;
      }
      return current.map(t => t.id !== threadId ? t : { ...t,
        ...(taskUpdate ? { status: taskUpdate.status, resolved: taskUpdate.status === "completed" } : {}),
        comments: [...t.comments, {
        id, threadId, body, createdAt: new Date().toISOString(),
        author: { id: `${AGENT_AUTHOR_PREFIX}${author}`, name: author, color: "#6366f1" },
        ...(taskUpdate ? { taskUpdate } : {}),
      }] });
    });
    return threads.find(t => t.id === threadId)!;
  }
}
