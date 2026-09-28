#!/usr/bin/env node
/**
 * Prove ONE physical intro-engine source. Duplicate renderer = FAIL.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const ENGINE_DIR = join(ROOT, "intro-engine");
const SCAN_ROOTS = ["app", "components", "lib", "intro-engine", "android", "ios"];
const FORBIDDEN_DUP_NAMES = [
  "SceneRenderer.ts",
  "LayerRenderer.ts",
  "media-fit.ts",
];
const FORBIDDEN_STRINGS = [
  "opening_show",
  "OpeningRuntime",
  "/api/admin/opening",
  "/api/app/opening",
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".tmp" || name === ".worktrees" || name === ".next") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const engineFiles = walk(ENGINE_DIR).filter((p) => p.endsWith(".ts") && !p.includes("/runtime-build/"));
const sceneHits = [];
const layerHits = [];
const fitHits = [];
const oldHits = [];

for (const root of SCAN_ROOTS) {
  const abs = join(ROOT, root);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  for (const file of walk(abs)) {
    const rel = relative(ROOT, file);
    const base = file.split("/").pop() ?? "";
    if (FORBIDDEN_DUP_NAMES.includes(base) && !rel.startsWith("intro-engine/")) {
      if (base === "SceneRenderer.ts") sceneHits.push(rel);
      if (base === "LayerRenderer.ts") layerHits.push(rel);
      if (base === "media-fit.ts") fitHits.push(rel);
    }
    if (!/\.(ts|tsx|js|mjs|swift|java)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const needle of FORBIDDEN_STRINGS) {
      if (text.includes(needle)) oldHits.push(`${rel}:${needle}`);
    }
  }
}

const report = {
  ENGINE_SOURCE_FILES: engineFiles.map((p) => relative(ROOT, p)).sort(),
  ADMIN_IMPORT_PATH: "@/intro-engine",
  RUNTIME_BUILD_ENTRY: "intro-engine/runtime-entry.ts",
  DUPLICATE_RENDERER_SEARCH: {
    SceneRenderer: sceneHits,
    LayerRenderer: layerHits,
    mediaFit: fitHits,
  },
  OLD_INTRO: oldHits,
};

if (sceneHits.length || layerHits.length || fitHits.length || oldHits.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, ...report, DUPLICATE_RENDERERS: 0 }, null, 2));
