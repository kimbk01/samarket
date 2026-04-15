import fs from "fs";
import path from "path";

const root = path.join(import.meta.dirname, "..");
const dist = path.join(root, ".next");
const chunksDir = path.join(dist, "static", "chunks");

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

const TOTAL_JS_BUDGET_KB = envInt("SAMARKET_BUNDLE_BUDGET_TOTAL_JS_KB", 9000);
const TOP_N = envInt("SAMARKET_BUNDLE_BUDGET_TOP_N", 20);

function walkFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(current, e.name);
      if (e.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out;
}

function formatKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

if (!fs.existsSync(chunksDir)) {
  console.error(`[bundle-budget] .next chunks not found: ${chunksDir}`);
  console.error(`[bundle-budget] Run \`npm run build\` first.`);
  process.exit(1);
}

const files = walkFiles(chunksDir).filter((p) => p.endsWith(".js"));

const entries = [];
let total = 0;
for (const p of files) {
  let stat;
  try {
    stat = fs.statSync(p);
  } catch {
    continue;
  }
  const size = stat.size || 0;
  total += size;
  entries.push({ path: path.relative(root, p).replace(/\\/g, "/"), size });
}

entries.sort((a, b) => b.size - a.size);

console.log(`[bundle-budget] total client js: ${formatKb(total)} (budget ${TOTAL_JS_BUDGET_KB} KB)`);
console.log(`[bundle-budget] largest chunks:`);
for (const e of entries.slice(0, TOP_N)) {
  console.log(`- ${formatKb(e.size)}  ${e.path}`);
}

if (Math.round(total / 1024) > TOTAL_JS_BUDGET_KB) {
  console.error(`[bundle-budget] FAIL: total js exceeds budget`);
  process.exit(2);
}

