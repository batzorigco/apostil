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
    remarq init         Set up remarq in this project
    remarq remove       Remove remarq from this project
    remarq help         Show this help

  Options:
    --keep-comments     Commit .remarq/ to git (share with team)
  `);
}

// ── remarq init ──────────────────────────────────────────────

async function init() {
  const cwd = process.cwd();
  const keepComments = args.includes("--keep-comments");

  console.log("\n  Setting up remarq...\n");

  // 1. Create .remarq/ directory
  await fs.mkdir(path.join(cwd, ".remarq"), { recursive: true });
  console.log("  ✓ Created .remarq/ directory");

  // 2. Add to .gitignore
  if (!keepComments) {
    await addToGitignore(cwd);
  } else {
    console.log("  · Comments will be committed to git");
  }

  // 3. Detect framework
  const framework = await detectFramework(cwd);

  // 4. Install package if needed
  const hasPackage = await checkDependency(cwd);
  if (!hasPackage) {
    console.log("  → Run: npm install remarq");
  }

  // 5. Framework-specific setup
  if (framework === "nextjs") {
    const isNew = await setupNextjs(cwd);
    if (isNew) {
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

  Then run your dev server — remarq is ready. Press C to comment.
`);
    } else {
      console.log("\n  remarq is already set up. Run your dev server and press C to comment.\n");
    }
  } else {
    console.log(`
  Done! Add the script tag to your HTML:

  <script src="https://unpkg.com/remarq/dist/injector.js"></script>

  Or install and import in your app.
`);
  }
}

// ── remarq remove ────────────────────────────────────────────

async function remove() {
  const cwd = process.cwd();
  console.log("\n  Removing remarq...\n");

  // Remove API route
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

async function addToGitignore(cwd: string) {
  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    let content = "";
    try { content = await fs.readFile(gitignorePath, "utf-8"); } catch {}
    if (!content.includes(".remarq")) {
      content += "\n# Remarq comments\n.remarq/\n";
      await fs.writeFile(gitignorePath, content, "utf-8");
      console.log("  ✓ Added .remarq/ to .gitignore");
    } else {
      console.log("  · .remarq/ already in .gitignore");
    }
  } catch {
    console.log("  · Could not update .gitignore");
  }
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
    return false; // already exists
  } catch {
    await fs.writeFile(routeFile, `export { GET, POST } from "remarq/adapters/nextjs";\n`, "utf-8");
    console.log("  ✓ Created api/remarq/route.ts");
    return true;
  }
}
