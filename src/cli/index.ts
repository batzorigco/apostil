#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";

const args = process.argv.slice(2);
const command = args[0];

if (command === "init") {
  init();
} else if (command === "remove") {
  remove();
} else if (command === "help" || command === "--help" || command === "-h" || !command) {
  printHelp();
} else {
  console.log(`  Unknown command: ${command}\n`);
  printHelp();
}

function printHelp() {
  console.log(`
  remarq — Pin-and-comment feedback for your app

  Usage:
    remarq init [mode]    Set up remarq in this project
    remarq remove         Remove remarq from this project
    remarq help           Show this help

  Modes:
    --dev        Default. Comments ignored, route committed.
                 Team shares the setup, not the comments.

    --personal   Everything ignored. Your private feedback,
                 nothing touches git.

    --public       Comments committed to git. Shared with the
                 whole team via version control.
  `);
}

type Mode = "dev" | "personal" | "public";

function getMode(): Mode {
  if (args.includes("--personal")) return "personal";
  if (args.includes("--public")) return "public";
  return "dev";
}

// ── remarq init ──────────────────────────────────────────────

async function init() {
  const cwd = process.cwd();
  const mode = getMode();

  console.log(`\n  Setting up remarq (${mode} mode)...\n`);

  // 1. Create .remarq/ directory
  await fs.mkdir(path.join(cwd, ".remarq"), { recursive: true });
  console.log("  ✓ Created .remarq/ directory");

  // 2. Update .gitignore based on mode
  await updateGitignore(cwd, mode);

  // 3. Detect framework
  const framework = await detectFramework(cwd);

  // 4. Check if package is installed
  const hasPackage = await checkDependency(cwd);
  if (!hasPackage) {
    console.log("  → Run: npm install remarq");
  }

  // 5. Framework-specific setup
  if (framework === "nextjs") {
    const isNew = await setupNextjs(cwd);
    if (isNew) {
      printSetupInstructions(mode);
    } else {
      console.log("\n  remarq is already set up. Run your dev server and press C to comment.\n");
    }
  } else {
    console.log("\n  Done! Add remarq to your app and run your dev server.\n");
  }
}

function printSetupInstructions(mode: Mode) {
  console.log(`
  Done! Add to your root layout:

  import { RemarqProvider, CommentOverlay, CommentToggle, CommentSidebar } from "remarq";

  export default function Layout({ children }) {
    return (
      <RemarqProvider pageId="my-page">
        <div style={{ position: "relative" }}>
          {children}
          <CommentOverlay />
          <CommentSidebar />
          <CommentToggle />
        </div>
      </RemarqProvider>
    );
  }

  Mode: ${mode}
  ${mode === "dev" ? "Comments are local only. Route is committed." : ""}${mode === "personal" ? "Everything is gitignored. Your private feedback." : ""}${mode === "public" ? "Comments are committed to git. Comments shared via git." : ""}

  Run your dev server and press C to comment.
`);
}

// ── remarq remove ────────────────────────────────────────────

async function remove() {
  const cwd = process.cwd();
  console.log("\n  Removing remarq...\n");

  const routePaths = [
    path.join(cwd, "src", "app", "api", "remarq"),
    path.join(cwd, "app", "api", "remarq"),
  ];
  for (const p of routePaths) {
    try {
      await fs.rm(p, { recursive: true });
      console.log("  ✓ Removed api/remarq/ route");
    } catch {}
  }

  // Clean gitignore
  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    let content = await fs.readFile(gitignorePath, "utf-8");
    content = content.replace(/\n# Remarq[^\n]*\n[^\n]*\n?/g, "\n");
    content = content.replace(/\n# Remarq[^\n]*\n/g, "\n");
    await fs.writeFile(gitignorePath, content, "utf-8");
    console.log("  ✓ Cleaned .gitignore");
  } catch {}

  console.log(`
  Done. You can also:
  - Remove .remarq/ directory (deletes all comments)
  - Remove remarq imports from your layout
  - Run: npm uninstall remarq
`);
}

// ── Helpers ──────────────────────────────────────────────────

async function detectFramework(cwd: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["next"]) return "nextjs";
    return null;
  } catch {
    return null;
  }
}

async function checkDependency(cwd: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return !!deps["remarq"];
  } catch {
    return false;
  }
}

async function updateGitignore(cwd: string, mode: Mode) {
  const gitignorePath = path.join(cwd, ".gitignore");
  let content = "";
  try { content = await fs.readFile(gitignorePath, "utf-8"); } catch {}

  // Remove any existing remarq entries
  content = content.replace(/\n# Remarq[^\n]*\n[^\n]*\n?/g, "\n");

  // Add based on mode
  switch (mode) {
    case "dev":
      // Ignore comments, keep route
      if (!content.includes(".remarq/")) {
        content += "\n# Remarq comments (local only)\n.remarq/\n";
      }
      console.log("  ✓ .remarq/ added to .gitignore (comments are local)");
      break;

    case "personal":
      // Ignore everything
      if (!content.includes(".remarq/")) {
        content += "\n# Remarq (personal mode)\n.remarq/\napp/api/remarq/\nsrc/app/api/remarq/\n";
      }
      console.log("  ✓ .remarq/ and api route added to .gitignore (fully private)");
      break;

    case "public":
      // Don't ignore anything — comments are shared
      console.log("  · .remarq/ will be committed to git (public mode)");
      break;
  }

  await fs.writeFile(gitignorePath, content, "utf-8");
}

async function setupNextjs(cwd: string): Promise<boolean> {
  const appDir = path.join(cwd, "src", "app");
  const appDirAlt = path.join(cwd, "app");
  let routeDir: string;

  try {
    await fs.access(appDir);
    routeDir = path.join(appDir, "api", "remarq");
  } catch {
    try {
      await fs.access(appDirAlt);
      routeDir = path.join(appDirAlt, "api", "remarq");
    } catch {
      console.log("  · Could not find app/ directory");
      return false;
    }
  }

  await fs.mkdir(routeDir, { recursive: true });
  const routeFile = path.join(routeDir, "route.ts");

  try {
    await fs.access(routeFile);
    return false;
  } catch {
    await fs.writeFile(routeFile, `export { GET, POST } from "remarq/adapters/nextjs";\n`, "utf-8");
    console.log("  ✓ Created api/remarq/route.ts");
    return true;
  }
}
