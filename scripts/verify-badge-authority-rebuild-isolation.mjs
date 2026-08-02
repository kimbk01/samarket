/**
 * Slice 2-1 — Badge authority rebuild foundation must not be imported by product runtime.
 * npm run verify:badge-authority-rebuild-isolation
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const MARKERS = [
  "badge-authority-rebuild/badge-authority-types",
  "badge-authority-rebuild/badge-recipient-identity",
  "badge-authority-rebuild/badge-event-classifier",
  "badge-authority-rebuild/badge-surface-eligibility",
  "badge-authority-rebuild/badge-count-units",
  "badge-authority-rebuild/badge-authority-assertions",
];

const SCAN = ["app", "components", "hooks", "services", "android", "ios"];
const LIB_SCAN = [
  "lib/notifications",
  "lib/messenger",
  "lib/push",
  "lib/chats",
  "lib/chat-domain",
  "lib/community-messenger",
];

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (["node_modules", "build", ".git"].includes(ent.name)) continue;
      if (p.replace(/\\/g, "/").includes("/badge-authority-rebuild")) continue;
      walk(p, out);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|kt|java|swift)$/.test(ent.name)) continue;
    out.push(p);
  }
}

function allow(rel) {
  const n = rel.replace(/\\/g, "/");
  if (n.includes("badge-authority-rebuild/")) return true;
  if (n.startsWith("scripts/")) return true;
  if (n.includes("__tests__/") || n.includes(".test.")) return true;
  return false;
}

const files = [];
for (const r of SCAN) walk(join(root, r), files);
for (const r of LIB_SCAN) walk(join(root, r), files);

for (const abs of files) {
  const rel = relative(root, abs).replace(/\\/g, "/");
  if (allow(rel)) continue;
  const src = readFileSync(abs, "utf8");
  for (const m of MARKERS) {
    if (src.includes(m)) errors.push(`${rel} imports foundation marker: ${m}`);
  }
}

if (errors.length) {
  console.error("verify:badge-authority-rebuild-isolation FAIL");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("verify:badge-authority-rebuild-isolation PASS");
