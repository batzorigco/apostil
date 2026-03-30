#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";

type Mode = "personal" | "dev" | "public";

const args = process.argv.slice(2);
const command = args[0];

if (command === "init") {
  const mode = parseMode(args.slice(1));
  init(mode);
} else if (command === "remove") {
  remove();
} else if (command === "help" || command === "--help" || command === "-h" || !command) {
  printHelp();
} else {
  console.log(`  Unknown command: ${command}\n`);
  printHelp();
}

function parseMode(flags: string[]): Mode {
  if (flags.includes("--dev")) return "dev";
  if (flags.includes("--public")) return "public";
  return "personal";
}

function printHelp() {
  console.log(`
  apostil — Pin-and-comment feedback for React & Next.js

  Usage:
    npx apostil init [mode]   Set up apostil in your Next.js project
    npx apostil remove        Remove apostil from your project
    npx apostil help          Show this help

  Modes:
    (default)    Personal — local dev only, comments gitignored
    --dev        Dev + staging — comments gitignored, env-controlled
    --public     All environments — comments committed to git
`);
}

async function init(mode: Mode) {
  const cwd = process.cwd();

  // Detect Next.js app directory
  const appDir = await findAppDir(cwd);
  if (!appDir) {
    console.log("  Could not find a Next.js app/ directory.");
    console.log("  Make sure you're running this from your project root.\n");
    process.exit(1);
  }

  // Detect src/ prefix
  const useSrc = appDir.includes("src/app");

  const modeLabel = mode === "personal" ? "personal" : mode === "dev" ? "dev" : "public";
  console.log(`\n  Setting up apostil (${modeLabel} mode)...\n`);

  // 1. Create API route
  const apiDir = path.join(appDir, "api", "apostil");
  const apiFile = path.join(apiDir, "route.ts");
  if (await fileExists(apiFile)) {
    console.log("  ✓ API route already exists");
  } else {
    await fs.mkdir(apiDir, { recursive: true });
    await fs.writeFile(
      apiFile,
      `export { GET, POST } from "apostil/adapters/nextjs";\n`,
      "utf-8"
    );
    console.log(`  ✓ Created ${rel(cwd, apiFile)}`);
  }

  // 2. Create wrapper component
  const componentsDir = path.join(cwd, useSrc ? "src/components" : "components");
  const wrapperFile = path.join(componentsDir, "apostil-wrapper.tsx");
  await fs.mkdir(componentsDir, { recursive: true });
  await fs.writeFile(wrapperFile, getWrapperComponent(mode), "utf-8");
  console.log(`  ✓ Created ${rel(cwd, wrapperFile)} (${modeLabel} mode)`);

  // 3. Create .apostil/ directory for comment storage
  const commentsDir = path.join(cwd, ".apostil");
  await fs.mkdir(commentsDir, { recursive: true });
  console.log("  ✓ Created .apostil/ directory");

  // 4. Handle .gitignore based on mode
  const gitignorePath = path.join(cwd, ".gitignore");
  let gitignore = "";
  try {
    gitignore = await fs.readFile(gitignorePath, "utf-8");
  } catch {}

  if (mode === "public") {
    // Public mode: don't gitignore comments — they get committed
    if (gitignore.includes(".apostil")) {
      console.log("  ✓ .gitignore unchanged (public mode — comments will be committed)");
    } else {
      console.log("  ✓ Comments will be committed to git (public mode)");
    }
  } else {
    // Personal & dev: gitignore comments
    if (!gitignore.includes(".apostil")) {
      const entry = "\n# Apostil comments\n.apostil/\n";
      await fs.appendFile(gitignorePath, entry, "utf-8");
      console.log("  ✓ Added .apostil/ to .gitignore");
    } else {
      console.log("  ✓ .gitignore already configured");
    }
  }

  // 5. Inject wrapper into root layout
  const layoutInjected = await injectIntoLayout(appDir, useSrc);
  if (layoutInjected) {
    console.log("  ✓ Added <ApostilWrapper> to root layout");
  }

  console.log("\n  Done! Run your dev server and press C to start commenting.\n");
}

async function remove() {
  const cwd = process.cwd();
  const appDir = await findAppDir(cwd);
  const useSrc = appDir?.includes("src/app") ?? false;

  console.log("\n  Removing apostil...\n");

  // 1. Remove API route
  if (appDir) {
    const apiDir = path.join(appDir, "api", "apostil");
    if (await fileExists(path.join(apiDir, "route.ts"))) {
      await fs.rm(apiDir, { recursive: true });
      console.log("  ✓ Removed API route");
    }
  }

  // 2. Remove wrapper component
  const componentsDir = path.join(cwd, useSrc ? "src/components" : "components");
  const wrapperFile = path.join(componentsDir, "apostil-wrapper.tsx");
  if (await fileExists(wrapperFile)) {
    await fs.rm(wrapperFile);
    console.log("  ✓ Removed wrapper component");
  }

  // 3. Remove wrapper from layout
  if (appDir) {
    const unwrapped = await removeFromLayout(appDir);
    if (unwrapped) {
      console.log("  ✓ Removed <ApostilWrapper> from root layout");
    }
  }

  // 4. Remove .apostil/ directory
  const commentsDir = path.join(cwd, ".apostil");
  if (await fileExists(commentsDir)) {
    await fs.rm(commentsDir, { recursive: true });
    console.log("  ✓ Removed .apostil/ directory");
  }

  // 5. Remove from .gitignore
  const gitignorePath = path.join(cwd, ".gitignore");
  try {
    let gitignore = await fs.readFile(gitignorePath, "utf-8");
    gitignore = gitignore.replace(/\n?# Apostil comments\n\.apostil\/\n?/g, "");
    await fs.writeFile(gitignorePath, gitignore, "utf-8");
    console.log("  ✓ Cleaned .gitignore");
  } catch {}

  console.log(`
  Done! Now run: npm uninstall apostil
`);
}

// --- Wrapper component template ---

function getWrapperComponent(mode: Mode): string {
  const envGuard = mode === "personal"
    ? `
  // Personal mode — only active in local development
  if (process.env.NODE_ENV !== "development") {
    return <>{children}</>;
  }
`
    : mode === "dev"
    ? `
  // Dev mode — active in dev + staging, disabled in production
  // Set NEXT_PUBLIC_APOSTIL=true to force on in any environment
  const forceOn = process.env.NEXT_PUBLIC_APOSTIL === "true";
  if (process.env.NODE_ENV === "production" && !forceOn) {
    return <>{children}</>;
  }
`
    : `
  // Public mode — active in all environments
  // Set NEXT_PUBLIC_APOSTIL=false to disable
  if (process.env.NEXT_PUBLIC_APOSTIL === "false") {
    return <>{children}</>;
  }
`;

  return `"use client";

import { usePathname } from "next/navigation";
import {
  ApostilProvider,
  CommentOverlay,
  CommentToggle,
  CommentSidebar,
} from "apostil";
import "apostil/styles.css";

export function ApostilWrapper({ children }: { children: React.ReactNode }) {${envGuard}
  const pathname = usePathname();
  const pageId = pathname.replace(/\\//g, "--").replace(/^--/, "") || "home";

  return (
    <ApostilProvider pageId={pageId}>
      {children}
      <CommentOverlay />
      <CommentSidebar />
      <CommentToggle />
    </ApostilProvider>
  );
}
`;
}

// --- Layout injection ---

async function injectIntoLayout(appDir: string, useSrc: boolean): Promise<boolean> {
  const layoutPath = await findLayout(appDir);
  if (!layoutPath) return false;

  let content = await fs.readFile(layoutPath, "utf-8");

  // Skip if already injected
  if (content.includes("ApostilWrapper")) {
    console.log("  ✓ Layout already has <ApostilWrapper>");
    return false;
  }

  // Add import at the top (after existing imports or "use" directives)
  const importPath = useSrc ? "@/components/apostil-wrapper" : "../components/apostil-wrapper";
  const importLine = `import { ApostilWrapper } from "${importPath}";\n`;

  // Find the last import statement and insert after it
  const importRegex = /^import\s.+$/gm;
  let lastImportIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    lastImportIndex = match.index + match[0].length;
  }

  if (lastImportIndex > 0) {
    content = content.slice(0, lastImportIndex) + "\n" + importLine + content.slice(lastImportIndex);
  } else {
    // No imports found, add at the top (after "use client" or "use server" if present)
    const useDirective = content.match(/^["']use (client|server)["'];?\n/);
    const insertAt = useDirective ? useDirective[0].length : 0;
    content = content.slice(0, insertAt) + importLine + content.slice(insertAt);
  }

  // Wrap {children} with <ApostilWrapper>
  // Handle both {children} and { children } patterns inside <body>
  const bodyChildrenRegex = /(<body[^>]*>)([\s\S]*?)(\{[\s]*children[\s]*\})([\s\S]*?)(<\/body>)/;
  const bodyMatch = content.match(bodyChildrenRegex);

  if (bodyMatch) {
    content = content.replace(
      bodyChildrenRegex,
      `$1$2<ApostilWrapper>$3</ApostilWrapper>$4$5`
    );
  } else {
    // Fallback: try to find {children} anywhere and wrap it
    const childrenRegex = /(\{[\s]*children[\s]*\})/;
    if (childrenRegex.test(content)) {
      content = content.replace(childrenRegex, `<ApostilWrapper>$1</ApostilWrapper>`);
    } else {
      console.log("  ⚠ Could not find {children} in layout — add <ApostilWrapper> manually");
      return false;
    }
  }

  await fs.writeFile(layoutPath, content, "utf-8");
  return true;
}

async function removeFromLayout(appDir: string): Promise<boolean> {
  const layoutPath = await findLayout(appDir);
  if (!layoutPath) return false;

  let content = await fs.readFile(layoutPath, "utf-8");

  if (!content.includes("ApostilWrapper")) return false;

  // Remove import line
  content = content.replace(/import\s*\{[^}]*ApostilWrapper[^}]*\}\s*from\s*["'][^"']+["'];?\n?/g, "");

  // Unwrap <ApostilWrapper>{children}</ApostilWrapper>
  content = content.replace(/<ApostilWrapper>([\s\S]*?)<\/ApostilWrapper>/g, "$1");

  await fs.writeFile(layoutPath, content, "utf-8");
  return true;
}

// --- Helpers ---

async function findAppDir(cwd: string): Promise<string | null> {
  for (const candidate of ["src/app", "app"]) {
    const dir = path.join(cwd, candidate);
    try {
      const stat = await fs.stat(dir);
      if (stat.isDirectory()) return dir;
    } catch {}
  }
  return null;
}

async function findLayout(appDir: string): Promise<string | null> {
  for (const ext of ["tsx", "jsx", "ts", "js"]) {
    const file = path.join(appDir, `layout.${ext}`);
    if (await fileExists(file)) return file;
  }
  return null;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function rel(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath);
}
