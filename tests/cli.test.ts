import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const CLI = path.join(__dirname, "..", "bin", "apostil.js");

// Create a temporary Next.js-like project structure for testing
async function createTempProject(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "apostil-test-"));
  // Create src/app/ directory with a layout
  await fs.mkdir(path.join(tmp, "src", "app"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "src", "app", "layout.tsx"),
    `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My App",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    "utf-8"
  );
  // Create next.config.js so framework detection works
  await fs.writeFile(path.join(tmp, "next.config.js"), "module.exports = {};\n", "utf-8");
  // Create a .gitignore
  await fs.writeFile(path.join(tmp, ".gitignore"), "node_modules/\n", "utf-8");
  return tmp;
}

function run(cmd: string, cwd: string): string {
  return execSync(`node ${CLI} ${cmd}`, { cwd, encoding: "utf-8" });
}

describe("CLI", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempProject();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("help", () => {
    it("prints help text", () => {
      const output = run("help", tmpDir);
      expect(output).toContain("apostil");
      expect(output).toContain("init");
      expect(output).toContain("remove");
    });
  });

  describe("init (default/personal mode)", () => {
    it("creates API route", async () => {
      run("init", tmpDir);
      const apiFile = path.join(tmpDir, "src", "app", "api", "apostil", "route.ts");
      const content = await fs.readFile(apiFile, "utf-8");
      expect(content).toContain('from "apostil/adapters/nextjs"');
    });

    it("creates wrapper component", async () => {
      run("init", tmpDir);
      const wrapperFile = path.join(tmpDir, "src", "components", "apostil-wrapper.tsx");
      const content = await fs.readFile(wrapperFile, "utf-8");
      expect(content).toContain("ApostilProvider");
      expect(content).toContain("CommentOverlay");
    });

    it("creates .apostil/ directory", async () => {
      run("init", tmpDir);
      const stat = await fs.stat(path.join(tmpDir, ".apostil"));
      expect(stat.isDirectory()).toBe(true);
    });

    it("adds .apostil/ to .gitignore", async () => {
      run("init", tmpDir);
      const gitignore = await fs.readFile(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".apostil/");
    });

    it("injects ApostilWrapper into layout", async () => {
      run("init", tmpDir);
      const layout = await fs.readFile(path.join(tmpDir, "src", "app", "layout.tsx"), "utf-8");
      expect(layout).toContain("<ApostilWrapper>");
      expect(layout).toContain("</ApostilWrapper>");
      expect(layout).toContain('import { ApostilWrapper }');
    });

    it("wrapper has personal mode env guard", async () => {
      run("init", tmpDir);
      const wrapper = await fs.readFile(
        path.join(tmpDir, "src", "components", "apostil-wrapper.tsx"),
        "utf-8"
      );
      expect(wrapper).toContain('NODE_ENV !== "development"');
    });

    it("does not duplicate on second run", async () => {
      run("init", tmpDir);
      run("init", tmpDir);
      const layout = await fs.readFile(path.join(tmpDir, "src", "app", "layout.tsx"), "utf-8");
      const matches = layout.match(/<ApostilWrapper>/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe("init --dev", () => {
    it("wrapper has dev mode env guard", async () => {
      run("init --dev", tmpDir);
      const wrapper = await fs.readFile(
        path.join(tmpDir, "src", "components", "apostil-wrapper.tsx"),
        "utf-8"
      );
      expect(wrapper).toContain("NEXT_PUBLIC_APOSTIL");
      expect(wrapper).toContain('NODE_ENV === "production"');
    });

    it("gitignores .apostil/", async () => {
      run("init --dev", tmpDir);
      const gitignore = await fs.readFile(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".apostil/");
    });
  });

  describe("init --public", () => {
    it("wrapper has public mode env guard", async () => {
      run("init --public", tmpDir);
      const wrapper = await fs.readFile(
        path.join(tmpDir, "src", "components", "apostil-wrapper.tsx"),
        "utf-8"
      );
      expect(wrapper).toContain('NEXT_PUBLIC_APOSTIL === "false"');
    });

    it("does not gitignore .apostil/", async () => {
      run("init --public", tmpDir);
      const gitignore = await fs.readFile(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).not.toContain(".apostil/");
    });
  });

  describe("remove", () => {
    it("removes API route", async () => {
      run("init", tmpDir);
      run("remove", tmpDir);
      const exists = await fs
        .stat(path.join(tmpDir, "src", "app", "api", "apostil", "route.ts"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("removes wrapper component", async () => {
      run("init", tmpDir);
      run("remove", tmpDir);
      const exists = await fs
        .stat(path.join(tmpDir, "src", "components", "apostil-wrapper.tsx"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("removes ApostilWrapper from layout", async () => {
      run("init", tmpDir);
      run("remove", tmpDir);
      const layout = await fs.readFile(path.join(tmpDir, "src", "app", "layout.tsx"), "utf-8");
      expect(layout).not.toContain("ApostilWrapper");
    });

    it("removes .apostil/ directory", async () => {
      run("init", tmpDir);
      run("remove", tmpDir);
      const exists = await fs
        .stat(path.join(tmpDir, ".apostil"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("cleans .gitignore", async () => {
      run("init", tmpDir);
      run("remove", tmpDir);
      const gitignore = await fs.readFile(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).not.toContain(".apostil/");
      // Original content should remain
      expect(gitignore).toContain("node_modules/");
    });

    it("layout is valid after remove (children still in body)", async () => {
      run("init", tmpDir);
      run("remove", tmpDir);
      const layout = await fs.readFile(path.join(tmpDir, "src", "app", "layout.tsx"), "utf-8");
      expect(layout).toContain("{children}");
      expect(layout).toContain("<body>");
      expect(layout).toContain("</body>");
    });
  });
});
