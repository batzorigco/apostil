import { defineConfig } from "tsup";

export default defineConfig([
  // Client-side (React components)
  {
    entry: {
      index: "src/index.ts",
      "adapters/localStorage": "src/adapters/localStorage.ts",
      "adapters/rest": "src/adapters/rest.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    loader: { ".svg": "dataurl" },
    clean: true,
    external: ["react", "react-dom"],
    banner: (ctx) => ctx.format === "esm" ? { js: '"use client";' } : {},
  },
  // Server-side (Next.js adapter + CLI)
  {
    entry: {
      "adapters/nextjs": "src/adapters/nextjs.ts",
      "adapters/vite": "src/adapters/vite.ts",
      "cli/index": "src/cli/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    external: ["react", "react-dom", "fs", "path"],
  },
]);
