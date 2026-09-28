/**
 * Bundle Dibay Intro runtime-entry into a sealed-pack engine.js artifact.
 * Kept outside the Next App Route graph so Turbopack never follows esbuild.
 *
 * Usage: node scripts/bundle-dibay-intro-engine.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const esbuild = require("esbuild");

const outFile = join(root, "lib/dibay-intro/engine/runtime-bundle.iife.js");
const entry = join(root, "lib/dibay-intro/engine/runtime-entry.ts");

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  target: ["es2020"],
  absWorkingDir: root,
  alias: { "@": root },
});

const file = result.outputFiles?.[0];
if (!file) {
  console.error("engine_bundle_failed");
  process.exit(1);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, file.contents);
console.log(`wrote ${outFile} (${file.contents.byteLength} bytes)`);
