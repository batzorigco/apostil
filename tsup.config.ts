import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/localStorage": "src/adapters/localStorage.ts",
    "adapters/rest": "src/adapters/rest.ts",
    "adapters/nextjs": "src/adapters/nextjs.ts",
    "adapters/global": "src/adapters/global.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  banner(ctx) {
    // CLI entry doesn't need "use client"
    if (ctx.entryPoint.includes("cli/")) return {};
    return { js: '"use client";' };
  },
});
