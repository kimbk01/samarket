#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(root, "intro-engine/runtime-build/engine.js");
const entry = resolve(root, "intro-engine/runtime-entry.ts");
mkdirSync(dirname(outfile), { recursive: true });

const bin = resolve(root, "node_modules/.bin/esbuild");
if (!existsSync(bin)) {
  console.error("[build-intro-engine-runtime] missing node_modules/.bin/esbuild");
  process.exit(1);
}

const result = spawnSync(
  bin,
  [
    entry,
    "--bundle",
    `--outfile=${outfile}`,
    "--format=iife",
    "--platform=browser",
    "--target=es2020",
    "--minify",
    "--legal-comments=none",
    "--log-level=info",
  ],
  { stdio: "inherit", cwd: root },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
console.log("[build-intro-engine-runtime] wrote", outfile);
