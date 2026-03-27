import { defineConfig } from "tsup";

export default defineConfig([
  // Client-side (React components)
  {
    entry: {
      index: "src/index.ts",
      "adapters/localStorage": "src/adapters/localStorage.ts",
      "adapters/rest": "src/adapters/rest.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["react", "react-dom"],
    banner: { js: '"use client";' },
  },
  // Server-side (Node adapters + CLI)
  {
    entry: {
      "adapters/nextjs": "src/adapters/nextjs.ts",
      "adapters/global": "src/adapters/global.ts",
      "cli/index": "src/cli/index.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    external: ["react", "react-dom", "fs", "path", "os", "http"],
  },
]);
