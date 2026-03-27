#!/usr/bin/env node
import("../dist/cli/index.js").catch(() => {
  console.error("remarq: run `npm run build` first, or use `npx remarq`");
  process.exit(1);
});
