import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type { ApostilPage, ApostilThread, ApostilTaskUpdate } from "../types";
import { getTaskStatus } from "../task-status";
import { isDeepStrictEqual } from "node:util";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

export function validateThreads(value: unknown, pageId?: string): asserts value is ApostilThread[] {
  if (!Array.isArray(value) || value.some(t => !t || typeof t.id !== "string" || !t.id ||
    typeof t.pageId !== "string" || (pageId !== undefined && t.pageId !== pageId) ||
    typeof t.resolved !== "boolean" || !Number.isFinite(t.pinX) || !Number.isFinite(t.pinY) ||
    (t.status !== undefined && !["open", "needs_review", "completed"].includes(t.status)) ||
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

  private async ensureDirectory(create = false) {
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

  private file(pageId: string) {
    if (!pageId || pageId.length > 512) throw new Error("Invalid page ID.");
    // Match existing Next.js file names while rejecting collisions on read/write.
    const name = pageId.replace(/[^a-zA-Z0-9_-]/g, "");
    // 0.2.0 stored punctuation-only / non-ASCII IDs (including "/") in .json.
    // Keep that filename; load() still checks the real page ID to prevent collisions.
    return path.join(this.directory, `${name}.json`);
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
    } catch (error) { if (missing(error)) return []; throw error; }
    finally { await handle?.close(); }
  }

  async load(pageId: string): Promise<ApostilThread[]> {
    const file = this.file(pageId);
    if (!await this.ensureDirectory()) return [];
    const threads = await this.readFile(file);
    if (threads.some(t => t.pageId !== pageId)) throw new Error("Page ID collides with another stored page.");
    return threads;
  }

  async loadAll(): Promise<ApostilPage[]> {
    if (!await this.ensureDirectory()) return [];
    const files = (await fs.readdir(this.directory)).filter(file => /^[\w-]*\.json$/.test(file)).sort();
    const pages: ApostilPage[] = [];
    for (const file of files) {
      const threads = await this.readFile(path.join(this.directory, file));
      if (!threads.length) continue;
      const pageId = threads[0].pageId;
      if (threads.some(t => t.pageId !== pageId) || path.basename(this.file(pageId)) !== file) throw new Error(`Inconsistent page data in ${file}.`);
      pages.push({ pageId, threads });
    }
    const latest = (page: ApostilPage) => Math.max(...page.threads.map(t => Date.parse(t.createdAt) || 0));
    return pages.sort((a, b) => latest(b) - latest(a));
  }

  private async update(pageId: string, change: (threads: ApostilThread[]) => ApostilThread[]) {
    await this.ensureDirectory(true);
    const file = this.file(pageId);
    const lock = `${file}.lock`;
    const deadline = Date.now() + 3000;
    while (true) {
      try { await fs.mkdir(lock); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) throw new Error(`Comments are locked. Retry; if a writer crashed, remove ${path.basename(lock)} after it has stopped.`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const next = change(await this.load(pageId));
      validateThreads(next, pageId);
      const data = JSON.stringify(next, null, 2);
      if (Buffer.byteLength(data) > MAX_FILE_SIZE) throw new Error("Comments exceed the 8 MB page limit.");
      await fs.writeFile(temporary, data, { flag: "wx", mode: 0o600 });
      await fs.rename(temporary, file);
      return next;
    } finally {
      try { await fs.unlink(temporary).catch(error => { if (!missing(error)) throw error; }); }
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
        else if (JSON.stringify(original) !== JSON.stringify(t)) throw new Error("This thread changed since you loaded it. Refresh before deleting it.");
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
        author: { id: `apostil-mcp:${author}`, name: author, color: "#6366f1" },
        ...(taskUpdate ? { taskUpdate } : {}),
      }] });
    });
    return threads.find(t => t.id === threadId)!;
  }
}
