// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MCPSettings } from "../src/components/mcp-settings";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("starts MCP, configures a client and distinguishes running from client activity", async () => {
  let running = false;
  const calls: object[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    const body = options?.body ? JSON.parse(options.body) : {};
    if (body.action) calls.push(body);
    if (body.action === "start") running = true;
    return Response.json({ running, port: 3846, url: "http://127.0.0.1:3846/mcp", clients: [], ...(body.action === "connect" ? { message: "Restart Codex in this project." } : {}) });
  }));
  render(<MCPSettings endpoint="/api/apostil?mcp=1" />);
  fireEvent.click(screen.getByRole("button", { name: /MCP/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Start MCP" }));
  await screen.findByText("Waiting for an AI client to connect.");
  expect(screen.getByRole("spinbutton", { name: "MCP port" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Set up Codex" }));
  await screen.findByText("Restart Codex in this project.");
  expect(calls).toEqual([{ action: "start", port: 3846 }, { action: "connect", port: 3846, client: "codex" }]);
});
it("does not show a running state for an old server or a custom remote adapter", async () => {
  const fetch = vi.fn(async () => Response.json([]));
  vi.stubGlobal("fetch", fetch);
  const view = render(<MCPSettings endpoint="/api/apostil?mcp=1" />);
  fireEvent.click(screen.getByRole("button", { name: /MCP/ }));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(screen.queryByRole("button", { name: "Start MCP" })).toBeNull();
  view.rerender(<MCPSettings endpoint="https://remote.example/api?mcp=1" />);
  expect(fetch).toHaveBeenCalledOnce();
});
it("shows the install command when the optional MCP packages are missing", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "The MCP packages are not installed. Run: npx apostil mcp init" }, { status: 501 })));
  render(<MCPSettings endpoint="/api/apostil?mcp=1" />);
  fireEvent.click(screen.getByRole("button", { name: /MCP/ }));
  await screen.findByText("The MCP packages are not installed. Run: npx apostil mcp init");
  expect(screen.queryByRole("button", { name: "Start MCP" })).toBeNull();
});
