#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";

type Mode = "personal" | "dev" | "public";
type Framework = "nextjs" | "vite";

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
  apostil — Lightweight, Figma-like commenting for React

  Usage:
    npx apostil init [mode]   Set up apostil in your project
    npx apostil remove        Remove apostil from your project
    npx apostil help          Show this help

  Modes:
    (default)    Personal — local dev only, comments gitignored
    --dev        Dev + staging — comments gitignored, env-controlled
    --public     All environments — comments committed to git

  Supported frameworks: Next.js (App Router), Vite + React
  Framework is auto-detected from your project.
`);
}

// --- Framework detection ---

async function detectFramework(cwd: string): Promise<Framework | null> {
  // Check config files first
  for (const name of ["next.config.js", "next.config.ts", "next.config.mjs"]) {
    if (await fileExists(path.join(cwd, name))) return "nextjs";
  }
  for (const name of ["vite.config.js", "vite.config.ts", "vite.config.mjs"]) {
    if (await fileExists(path.join(cwd, name))) return "vite";
  }

  // Fallback: check package.json dependencies
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["next"]) return "nextjs";
    if (deps["vite"]) return "vite";
  } catch {}

  return null;
}

// --- Init ---

async function init(mode: Mode) {
  const cwd = process.cwd();
  const framework = await detectFramework(cwd);

  if (!framework) {
    console.log("  Could not detect your framework.");
    console.log("  Apostil supports Next.js (App Router) and Vite + React.");
    console.log("  Make sure you're running this from your project root.\n");
    process.exit(1);
  }

  console.log(`\n  Detected: ${framework === "nextjs" ? "Next.js" : "Vite + React"}`);

  if (framework === "nextjs") {
    await initNextjs(cwd, mode);
  } else {
    await initVite(cwd, mode);
  }
}

// --- Next.js init ---

async function initNextjs(cwd: string, mode: Mode) {
  const appDir = await findAppDir(cwd);
  if (!appDir) {
    console.log("  Could not find a Next.js app/ directory.");
    console.log("  Make sure you're using the App Router.\n");
    process.exit(1);
  }

  const useSrc = appDir.includes("src/app");
  const modeLabel = mode === "personal" ? "personal" : mode === "dev" ? "dev" : "public";
  console.log(`  Setting up apostil (${modeLabel} mode)...\n`);

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
  await fs.writeFile(wrapperFile, getNextjsWrapper(mode), "utf-8");
  console.log(`  ✓ Created ${rel(cwd, wrapperFile)} (${modeLabel} mode)`);

  // 3. Create .apostil/ directory
  const commentsDir = path.join(cwd, ".apostil");
  await fs.mkdir(commentsDir, { recursive: true });
  console.log("  ✓ Created .apostil/ directory");

  // 4. Handle .gitignore
  await handleGitignore(cwd, mode);

  // 5. Inject wrapper into root layout
  const layoutInjected = await injectIntoNextjsLayout(appDir, useSrc);
  if (layoutInjected) {
    console.log("  ✓ Added <ApostilWrapper> to root layout");
  }

  console.log("\n  Done! Run your dev server and press C to start commenting.\n");
}

// --- Vite init ---

async function initVite(cwd: string, mode: Mode) {
  const useSrc = await fileExists(path.join(cwd, "src"));
  const modeLabel = mode === "personal" ? "personal" : mode === "dev" ? "dev" : "public";
  console.log(`  Setting up apostil (${modeLabel} mode)...\n`);

  // 1. Create wrapper component
  const componentsDir = path.join(cwd, useSrc ? "src/components" : "components");
  const wrapperFile = path.join(componentsDir, "apostil-wrapper.tsx");
  await fs.mkdir(componentsDir, { recursive: true });
  const hasRouter = await hasReactRouter(cwd);
  await fs.writeFile(wrapperFile, getViteWrapper(mode, hasRouter), "utf-8");
  console.log(`  ✓ Created ${rel(cwd, wrapperFile)} (${modeLabel} mode)`);

  console.log("  ✓ Using localStorage adapter (comments stored in browser)");

  // 3. Inject wrapper into entry point
  const entryInjected = await injectIntoViteEntry(cwd, useSrc);
  if (entryInjected) {
    console.log("  ✓ Added <ApostilWrapper> to app entry");
  }

  console.log("\n  Done! Run your dev server and press C to start commenting.\n");
}

// --- Wrapper templates ---

function getNextjsWrapper(mode: Mode): string {
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

async function hasReactRouter(cwd: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return !!deps["react-router-dom"] || !!deps["react-router"];
  } catch {
    return false;
  }
}

// No "use client" directive — Vite doesn't use React Server Components
function getViteWrapper(mode: Mode, hasRouter: boolean): string {
  const envGuard = mode === "personal"
    ? `
  // Personal mode — only active in local development
  if (import.meta.env.PROD) {
    return <>{children}</>;
  }
`
    : mode === "dev"
    ? `
  // Dev mode — active in dev + staging, disabled in production
  // Set VITE_APOSTIL=true to force on in any environment
  const forceOn = import.meta.env.VITE_APOSTIL === "true";
  if (import.meta.env.PROD && !forceOn) {
    return <>{children}</>;
  }
`
    : `
  // Public mode — active in all environments
  // Set VITE_APOSTIL=false to disable
  if (import.meta.env.VITE_APOSTIL === "false") {
    return <>{children}</>;
  }
`;

  const routerImport = hasRouter
    ? `import { useLocation } from "react-router-dom";\n`
    : "";

  const pageIdLogic = hasRouter
    ? `  const location = useLocation();
  const pageId = location.pathname.replace(/\\//g, "--").replace(/^--/, "") || "home";`
    : `  const pageId = window.location.pathname.replace(/\\//g, "--").replace(/^--/, "") || "home";`;

  return `${routerImport}import {
  ApostilProvider,
  CommentOverlay,
  CommentToggle,
  CommentSidebar,
} from "apostil";
import { localStorageAdapter } from "apostil/adapters/localStorage";
import "apostil/styles.css";

export function ApostilWrapper({ children }: { children: React.ReactNode }) {${envGuard}
${pageIdLogic}

  return (
    <ApostilProvider pageId={pageId} storage={localStorageAdapter}>
      {children}
      <CommentOverlay />
      <CommentSidebar />
      <CommentToggle />
    </ApostilProvider>
  );
}
`;
}

// --- Gitignore ---

async function handleGitignore(cwd: string, mode: Mode) {
  const gitignorePath = path.join(cwd, ".gitignore");
  let gitignore = "";
  try {
    gitignore = await fs.readFile(gitignorePath, "utf-8");
  } catch {}

  if (mode === "public") {
    if (gitignore.includes(".apostil")) {
      console.log("  ✓ .gitignore unchanged (public mode — comments will be committed)");
    } else {
      console.log("  ✓ Comments will be committed to git (public mode)");
    }
  } else {
    if (!gitignore.includes(".apostil")) {
      const entry = "\n# Apostil comments\n.apostil/\n";
      await fs.appendFile(gitignorePath, entry, "utf-8");
      console.log("  ✓ Added .apostil/ to .gitignore");
    } else {
      console.log("  ✓ .gitignore already configured");
    }
  }
}

// --- Next.js layout injection ---

async function injectIntoNextjsLayout(appDir: string, useSrc: boolean): Promise<boolean> {
  const layoutPath = await findLayout(appDir);
  if (!layoutPath) return false;

  let content = await fs.readFile(layoutPath, "utf-8");

  if (content.includes("ApostilWrapper")) {
    console.log("  ✓ Layout already has <ApostilWrapper>");
    return false;
  }

  const importPath = useSrc ? "@/components/apostil-wrapper" : "../components/apostil-wrapper";
  const importLine = `import { ApostilWrapper } from "${importPath}";\n`;

  const importRegex = /^import\s.+$/gm;
  let lastImportIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    lastImportIndex = match.index + match[0].length;
  }

  if (lastImportIndex > 0) {
    content = content.slice(0, lastImportIndex) + "\n" + importLine + content.slice(lastImportIndex);
  } else {
    const useDirective = content.match(/^["']use (client|server)["'];?\n/);
    const insertAt = useDirective ? useDirective[0].length : 0;
    content = content.slice(0, insertAt) + importLine + content.slice(insertAt);
  }

  const bodyChildrenRegex = /(<body[^>]*>)([\s\S]*?)(\{[\s]*children[\s]*\})([\s\S]*?)(<\/body>)/;
  const bodyMatch = content.match(bodyChildrenRegex);

  if (bodyMatch) {
    content = content.replace(
      bodyChildrenRegex,
      `$1$2<ApostilWrapper>$3</ApostilWrapper>$4$5`
    );
  } else {
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

// --- Vite entry injection ---

async function injectIntoViteEntry(cwd: string, useSrc: boolean): Promise<boolean> {
  const baseDir = useSrc ? path.join(cwd, "src") : cwd;

  // Inject into main.tsx/jsx — wrap <App /> which is a reliable, unique target
  for (const ext of ["tsx", "jsx"]) {
    const mainFile = path.join(baseDir, `main.${ext}`);
    if (await fileExists(mainFile)) {
      return await injectIntoViteMain(mainFile);
    }
  }

  console.log("  ⚠ Could not find main.tsx or main.jsx — add <ApostilWrapper> manually");
  return false;
}

async function injectIntoViteMain(mainFile: string, wrapperFile?: string): Promise<boolean> {
  let content = await fs.readFile(mainFile, "utf-8");

  if (content.includes("ApostilWrapper")) {
    console.log("  ✓ Entry already has <ApostilWrapper>");
    return false;
  }

  // Compute relative import path from main file to wrapper
  const mainDir = path.dirname(mainFile);
  const wrapperPath = wrapperFile ?? path.join(mainDir, "components", "apostil-wrapper.tsx");
  let relativePath = path.relative(mainDir, wrapperPath).replace(/\.tsx$/, "");
  if (!relativePath.startsWith(".")) relativePath = "./" + relativePath;
  const importLine = `import { ApostilWrapper } from "${relativePath}";\n`;
  const importRegex = /^import\s.+$/gm;
  let lastImportIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    lastImportIndex = match.index + match[0].length;
  }

  if (lastImportIndex > 0) {
    content = content.slice(0, lastImportIndex) + "\n" + importLine + content.slice(lastImportIndex);
  } else {
    content = importLine + content;
  }

  // Wrap <App /> with <ApostilWrapper>
  content = content.replace(/<App\s*\/>/, `<ApostilWrapper><App /></ApostilWrapper>`);

  await fs.writeFile(mainFile, content, "utf-8");
  return true;
}

// --- Remove ---

async function remove() {
  const cwd = process.cwd();
  const framework = await detectFramework(cwd);

  console.log("\n  Removing apostil...\n");

  if (framework === "nextjs") {
    await removeNextjs(cwd);
  } else if (framework === "vite") {
    await removeVite(cwd);
  } else {
    // Try both
    await removeNextjs(cwd);
    await removeVite(cwd);
  }

  // Remove .apostil/ directory
  const commentsDir = path.join(cwd, ".apostil");
  if (await fileExists(commentsDir)) {
    await fs.rm(commentsDir, { recursive: true });
    console.log("  ✓ Removed .apostil/ directory");
  }

  // Remove from .gitignore
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

async function removeNextjs(cwd: string) {
  const appDir = await findAppDir(cwd);
  const useSrc = appDir?.includes("src/app") ?? false;

  // Remove API route
  if (appDir) {
    const apiDir = path.join(appDir, "api", "apostil");
    if (await fileExists(path.join(apiDir, "route.ts"))) {
      await fs.rm(apiDir, { recursive: true });
      console.log("  ✓ Removed API route");
    }
  }

  // Remove wrapper component
  const componentsDir = path.join(cwd, useSrc ? "src/components" : "components");
  const wrapperFile = path.join(componentsDir, "apostil-wrapper.tsx");
  if (await fileExists(wrapperFile)) {
    await fs.rm(wrapperFile);
    console.log("  ✓ Removed wrapper component");
  }

  // Remove wrapper from layout
  if (appDir) {
    const layoutPath = await findLayout(appDir);
    if (layoutPath) {
      const unwrapped = await removeWrapperFromFile(layoutPath);
      if (unwrapped) {
        console.log("  ✓ Removed <ApostilWrapper> from root layout");
      }
    }
  }
}

async function removeVite(cwd: string) {
  const useSrc = await fileExists(path.join(cwd, "src"));
  const baseDir = useSrc ? path.join(cwd, "src") : cwd;

  // Remove wrapper component
  const componentsDir = path.join(cwd, useSrc ? "src/components" : "components");
  const wrapperFile = path.join(componentsDir, "apostil-wrapper.tsx");
  if (await fileExists(wrapperFile)) {
    await fs.rm(wrapperFile);
    console.log("  ✓ Removed wrapper component");
  }

  // Remove wrapper from App.tsx or main.tsx
  for (const name of ["App.tsx", "App.jsx", "main.tsx", "main.jsx"]) {
    const file = path.join(baseDir, name);
    if (await fileExists(file)) {
      const unwrapped = await removeWrapperFromFile(file);
      if (unwrapped) {
        console.log(`  ✓ Removed <ApostilWrapper> from ${name}`);
      }
    }
  }
}

async function removeWrapperFromFile(filePath: string): Promise<boolean> {
  let content = await fs.readFile(filePath, "utf-8");
  if (!content.includes("ApostilWrapper")) return false;

  // Remove import line
  content = content.replace(/import\s*\{[^}]*ApostilWrapper[^}]*\}\s*from\s*["'][^"']+["'];?\n?/g, "");

  // Unwrap <ApostilWrapper>...</ApostilWrapper>
  content = content.replace(/<ApostilWrapper>([\s\S]*?)<\/ApostilWrapper>/g, "$1");

  await fs.writeFile(filePath, content, "utf-8");
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
