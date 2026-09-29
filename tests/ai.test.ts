import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAIPrompt, createAISender } from "../src/ai";
import type { ApostilThread } from "../src/types";

afterEach(() => vi.restoreAllMocks());

it("preserves replies, statuses, page identity, and legacy targets in the handoff", () => {
  const threads = [{ id: "t1", pageId: "settings", targetId: "#save", resolved: true, comments: [{ body: "Increase contrast" }, { body: "Only in dark mode" }] }] as ApostilThread[];
  const prompt = buildAIPrompt(threads);
  expect(prompt).toContain("Only in dark mode");
  expect(prompt).toContain('"resolved": true');
  expect(prompt).toContain('"targetId": "#save"');
  expect(prompt).toContain("historical context only");
});

describe("agent transport", () => {
  const request = { version: 1 as const, provider: "codex" as const, requestId: "r1", prompt: "Feedback" };
  it("posts the complete request to the configured endpoint", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ message: "Done" }));
    expect(await createAISender("/agent")(request)).toEqual({ message: "Done" });
    expect(fetch).toHaveBeenCalledWith("/agent", expect.objectContaining({ body: JSON.stringify(request), method: "POST" }));
  });
  it("surfaces failure and rejects false success responses", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "Not connected" }, { status: 403 }));
    await expect(createAISender("/agent")(request)).rejects.toThrow("Not connected");
    fetch.mockResolvedValue(Response.json({ ok: true }));
    await expect(createAISender("/agent")(request)).rejects.toThrow("did not return a result");
  });
});
