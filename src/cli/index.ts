#!/usr/bin/env node

import http from "http";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { getInjectorScript } from "./injector";

const DEFAULT_PORT = 4567;
const REMARQ_DIR = path.join(os.homedir(), ".remarq");

const args = process.argv.slice(2);
const command = args[0];

if (command === "start" || !command) {
  startServer();
} else if (command === "stop") {
  stopServer();
} else if (command === "status") {
  checkStatus();
} else if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else {
  console.log(`Unknown command: ${command}`);
  printHelp();
}

function printHelp() {
  console.log(`
  remarq — Pin-and-comment feedback overlay

  Usage:
    remarq              Start the server (default)
    remarq start        Start the server
    remarq stop         Stop the running server
    remarq status       Check if server is running

  Options:
    --port <number>     Port to run on (default: ${DEFAULT_PORT})
    --project <name>    Project name for organizing comments

  How to use:
    1. Run: npx remarq
    2. Add to your HTML:
       <script src="http://localhost:${DEFAULT_PORT}/remarq.js"></script>
    3. Or add to your dev server's entry point:
       import "http://localhost:${DEFAULT_PORT}/remarq.js"

  Comments are stored in ~/.remarq/<project>/
  `);
}

function getPort(): number {
  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) {
    return parseInt(args[portIdx + 1], 10) || DEFAULT_PORT;
  }
  return DEFAULT_PORT;
}

function getProject(): string {
  const projIdx = args.indexOf("--project");
  if (projIdx !== -1 && args[projIdx + 1]) {
    return args[projIdx + 1].replace(/[^a-zA-Z0-9_-]/g, "");
  }
  // Default: use current directory name
  return path.basename(process.cwd()).replace(/[^a-zA-Z0-9_-]/g, "") || "default";
}

async function startServer() {
  const port = getPort();
  const project = getProject();
  const projectDir = path.join(REMARQ_DIR, project);

  await fs.mkdir(projectDir, { recursive: true });

  const server = http.createServer(async (req, res) => {
    // CORS headers for cross-origin script injection
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // Serve the injector script
    if (url.pathname === "/remarq.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.writeHead(200);
      res.end(getInjectorScript(port));
      return;
    }

    // API: load comments
    if (req.method === "GET" && url.pathname === "/api/comments") {
      const pageId = url.searchParams.get("pageId") ?? "default";
      const safeName = pageId.replace(/[^a-zA-Z0-9_-]/g, "");
      const file = path.join(projectDir, `${safeName}.json`);
      try {
        const data = await fs.readFile(file, "utf-8");
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(data);
      } catch {
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end("[]");
      }
      return;
    }

    // API: save comments
    if (req.method === "POST" && url.pathname === "/api/comments") {
      const pageId = url.searchParams.get("pageId") ?? "default";
      const safeName = pageId.replace(/[^a-zA-Z0-9_-]/g, "");
      const file = path.join(projectDir, `${safeName}.json`);
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          await fs.writeFile(file, JSON.stringify(JSON.parse(body), null, 2), "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.writeHead(200);
          res.end('{"ok":true}');
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    // Status endpoint
    if (url.pathname === "/status") {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({ status: "running", project, port, dir: projectDir }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║           remarq is running             ║
  ╠══════════════════════════════════════════╣
  ║                                          ║
  ║  Server:  http://localhost:${String(port).padEnd(15)}║
  ║  Project: ${project.padEnd(30)}║
  ║  Storage: ~/.remarq/${project.padEnd(20)}║
  ║                                          ║
  ║  Add to your app:                        ║
  ║  <script src="http://localhost:${port}/   ║
  ║    remarq.js"></script>                  ║
  ║                                          ║
  ║  Press Ctrl+C to stop                    ║
  ╚══════════════════════════════════════════╝
    `);

    // Save PID for stop command
    const pidFile = path.join(REMARQ_DIR, ".pid");
    fs.writeFile(pidFile, String(process.pid), "utf-8").catch(() => {});
  });

  // Cleanup on exit
  process.on("SIGINT", () => {
    console.log("\n  remarq stopped.");
    const pidFile = path.join(REMARQ_DIR, ".pid");
    fs.unlink(pidFile).catch(() => {});
    process.exit(0);
  });
}

async function stopServer() {
  const pidFile = path.join(REMARQ_DIR, ".pid");
  try {
    const pid = parseInt(await fs.readFile(pidFile, "utf-8"), 10);
    process.kill(pid, "SIGINT");
    console.log(`  remarq stopped (pid ${pid})`);
  } catch {
    console.log("  remarq is not running");
  }
}

async function checkStatus() {
  const port = getPort();
  try {
    const res = await fetch(`http://localhost:${port}/status`);
    const data = await res.json();
    console.log(`  remarq is running`);
    console.log(`  Project: ${data.project}`);
    console.log(`  Port:    ${data.port}`);
    console.log(`  Storage: ${data.dir}`);
  } catch {
    console.log("  remarq is not running");
  }
}
