// @vitest-environment node
import { expect, it } from "vitest";
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// These tests check the built package. `npm test` builds first (pretest); a direct vitest run needs a build.
if (!fs.existsSync(path.join(root, "dist/index.d.ts"))) throw new Error("dist/ is missing. Run `npm run build` (or `npm test`, which builds first) before this file.");

it("keeps the built public API assignable to the published 0.2.0 declarations", () => {
  const fixture = path.join(root, "tests/compatibility-api.tsx");
  const source = `
    import * as previous from './fixtures/apostil-0.2.0/index';
    import * as current from '../dist/index';
    import * as oldNext from './fixtures/apostil-0.2.0/adapters/nextjs';
    import * as newNext from '../dist/adapters/nextjs';
    import * as oldRest from './fixtures/apostil-0.2.0/adapters/rest';
    import * as newRest from '../dist/adapters/rest';
    import * as oldLocal from './fixtures/apostil-0.2.0/adapters/localStorage';
    import * as newLocal from '../dist/adapters/localStorage';
    const api: typeof previous = current;
    const overlay: typeof previous.CommentOverlay = current.CommentOverlay;
    const next: typeof oldNext = newNext;
    const rest: typeof oldRest = newRest;
    const local: typeof oldLocal = newLocal;
    declare const oldThread: previous.ApostilThread;
    declare const oldComment: previous.ApostilComment;
    declare const oldStorage: previous.ApostilStorage;
    declare const oldUser: previous.ApostilUser;
    const thread: current.ApostilThread = oldThread;
    const comment: current.ApostilComment = oldComment;
    const storage: current.ApostilStorage = oldStorage;
    const user: current.ApostilUser = oldUser;
    const app = <current.ApostilProvider pageId="/" storage={oldStorage} brandColor="#f00">
      <current.CommentOverlay/><current.CommentToggle/><current.CommentSidebar/>
    </current.ApostilProvider>;
  `;
  const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: false, target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true, types: [] };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, version, ...args) => file === fixture
    ? ts.createSourceFile(file, source, version, true, ts.ScriptKind.TSX) : getSourceFile(file, version, ...args);
  const errors = ts.getPreEmitDiagnostics(ts.createProgram([fixture], options, host));
  expect(ts.formatDiagnostics(errors, { getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => "\n" })).toBe("");
});

it("retains every published package entry point and generated target", () => {
  const oldPackage = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/apostil-0.2.0/published-manifest.json"), "utf8"));
  const current = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  // 0.3.0 nests a `types` under each of import/require so CJS consumers get .d.cts; every 0.2.0 target must stay reachable.
  const leaves = (value: unknown): string[] => typeof value === "string" ? [value] : Object.values(value as object).flatMap(leaves);
  for (const [entry, targets] of Object.entries(oldPackage.exports)) {
    const now = leaves(current.exports[entry]);
    for (const target of leaves(targets)) {
      expect(now, `${entry} -> ${target}`).toContain(target);
      expect(fs.existsSync(path.join(root, target)), target).toBe(true);
    }
  }
  for (const target of Object.values(current.exports).flatMap(leaves)) expect(fs.existsSync(path.join(root, target)), target).toBe(true);
  // New peers must be optional, so an upgrade from 0.2.0 needs no extra install.
  const required = Object.fromEntries(Object.entries(current.peerDependencies).filter(([name]) => !current.peerDependenciesMeta?.[name]?.optional));
  expect(required).toEqual(oldPackage.peerDependencies);
});
