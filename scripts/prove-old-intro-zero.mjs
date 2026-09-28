#!/usr/bin/env node
/**
 * PHASE A proof — OLD INTRO product import graph = ZERO.
 * Not grep-only: walks live product imports from mounts + checks routes/API/native/DB/storage.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LIVE_ROOTS = ["app", "components", "lib", "scripts", "tests", "android/app/src", "ios/App/App"];
const SKIP_DIR = new Set([
  "node_modules",
  ".next",
  ".tmp",
  ".worktrees",
  ".recovery",
  "Pods",
  "build",
  "dist",
]);

const FORBIDDEN_IMPORT_NEEDLES = [
  "IntroEditor",
  "SceneWorkspace",
  "SceneStoryboard",
  "ScenePropertiesPanel",
  "IntroMediaLibrary",
  "AdminIntroLegacyReadOnly",
  "ProductIntroHost",
  "ProductIntroMaterializeController",
  "DibayStartupIntro",
  "DibayStartupIntroSurface",
  "startup-product-intro",
  "lib/startup/intro-v3",
  "lib/startup/intro-v2",
  "lib/startup/intro/",
  "components/admin/intro/",
  "components/admin/intro-v3",
  "ProductIntroAdminSection",
  "persistProductIntro",
  "isProductIntroOverlayActive",
  "subscribeProductIntroOverlayActive",
];

const FORBIDDEN_FILES = [
  "components/app/DibayStartupIntro.tsx",
  "components/app/ProductIntroHost.tsx",
  "components/app/ProductIntroMaterializeController.tsx",
  "components/admin/settings/ProductIntroAdminSection.tsx",
  "android/app/src/main/java/com/dibay/app/DibayStartupIntroSurface.java",
];

const ENTRY_FILES = [
  "app/layout.tsx",
  "app/admin/intro/page.tsx",
  "app/admin/intro/[showId]/page.tsx",
  "app/admin/intro-v3/page.tsx",
  "app/admin/intro-v3/[campaignId]/page.tsx",
  "components/platform-popup/GlobalPopupHost.tsx",
  "components/admin/settings/StartupConfigAdminPage.tsx",
  "components/admin/admin-menu.ts",
  "lib/startup/index.ts",
  "android/app/src/main/java/com/dibay/app/MainActivity.java",
  "ios/App/App/DibayStartupBridgeViewController.swift",
];

const hits = [];
const graph = [];

function walkDir(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const stack = [abs];
  while (stack.length) {
    const cur = stack.pop();
    let ents;
    try {
      ents = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of ents) {
      if (SKIP_DIR.has(ent.name)) continue;
      const next = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(next);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs|java|swift)$/.test(ent.name)) {
        out.push(path.relative(ROOT, next));
      }
    }
  }
  return out;
}

function resolveImport(fromFile, spec) {
  if (spec.startsWith("@/")) {
    const bare = spec.slice(2);
    for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"]) {
      const cand = path.join(ROOT, bare + ext);
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        return path.relative(ROOT, cand);
      }
    }
    return bare;
  }
  if (spec.startsWith(".")) {
    const base = path.resolve(path.dirname(path.join(ROOT, fromFile)), spec);
    for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"]) {
      const cand = base + ext;
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        return path.relative(ROOT, cand);
      }
    }
  }
  return null;
}

const IMPORT_RE =
  /(?:from|import)\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|export\s+\*\s+from\s+["']([^"']+)["']/g;

function walkGraph(startRel) {
  const seen = new Set();
  const queue = [startRel];
  while (queue.length) {
    const rel = queue.shift();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const src = fs.readFileSync(abs, "utf8");
    for (const needle of FORBIDDEN_IMPORT_NEEDLES) {
      if (src.includes(needle)) {
        hits.push({ kind: "graph", file: rel, needle, from: startRel });
      }
    }
    IMPORT_RE.lastIndex = 0;
    let m;
    while ((m = IMPORT_RE.exec(src))) {
      const spec = m[1] || m[2] || m[3];
      const resolved = resolveImport(rel, spec);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

for (const entry of ENTRY_FILES) {
  const visited = walkGraph(entry);
  graph.push({ entry, visitedCount: visited.length });
}

for (const file of FORBIDDEN_FILES) {
  if (fs.existsSync(path.join(ROOT, file))) {
    hits.push({ kind: "file", file, needle: "must_be_deleted" });
  }
}

const liveFiles = LIVE_ROOTS.flatMap(walkDir);
for (const file of liveFiles) {
  if (file.startsWith("app/admin/intro")) continue;
  if (file === "scripts/verify-startup-architecture.cjs") continue;
  if (file === "scripts/prove-old-intro-zero.mjs") continue;
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const needle of FORBIDDEN_IMPORT_NEEDLES) {
    if (src.includes(needle)) {
      hits.push({ kind: "live", file, needle });
    }
  }
  if (/\bfrom\(\s*["']intro_/.test(src) || /startup_product_intro_v1/.test(src)) {
    hits.push({ kind: "db", file, needle: "intro_table_or_settings_key" });
  }
  if (src.includes("_admin/intro-v2") || src.includes("_admin/intro-v3") || src.includes("_admin/startup/product")) {
    hits.push({ kind: "storage", file, needle: "legacy_intro_prefix" });
  }
}

const apiDirs = [
  "app/api/admin/intro-v3",
  "app/api/admin/intro-campaigns",
  "app/api/admin/startup-product-intro",
  "app/api/app/startup-product-intro",
];
for (const dir of apiDirs) {
  if (fs.existsSync(path.join(ROOT, dir))) {
    hits.push({ kind: "api", file: dir, needle: "old_intro_api_dir" });
  }
}

const report = {
  ok: hits.length === 0,
  hitCount: hits.length,
  hits,
  graph,
  liveFileCount: liveFiles.length,
};

const outDir = path.join(ROOT, ".tmp/opening-cut1a");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "PROVE_ZERO.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));
if (hits.length) {
  console.error("[prove-old-intro-zero] FAIL", hits.length);
  for (const h of hits.slice(0, 40)) console.error(h);
  process.exit(1);
}
console.log("[prove-old-intro-zero] PASS hits=0 liveFiles=" + liveFiles.length);
console.log(JSON.stringify(graph, null, 2));
