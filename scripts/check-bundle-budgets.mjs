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
// Defaults are intentionally permissive and based on current build output.
// Tighten these in CI via env once routes are stabilized.
const MESSENGER_HOME_BUDGET_KB = envInt("SAMARKET_BUNDLE_BUDGET_MESSENGER_HOME_JS_KB", 950);
const MESSENGER_ROOM_BUDGET_KB = envInt("SAMARKET_BUNDLE_BUDGET_MESSENGER_ROOM_JS_KB", 1100);
const MESSENGER_CALL_BUDGET_KB = envInt("SAMARKET_BUNDLE_BUDGET_MESSENGER_CALL_JS_KB", 2600);

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

function sumByPrefix(prefix) {
  let bytes = 0;
  for (const e of entries) {
    if (e.path.startsWith(prefix)) bytes += e.size;
  }
  return bytes;
}

function extractChunkRefsFromClientManifest(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf8");
    const out = new Set();
    const re = new RegExp('static/chunks/[^"\'\\s]+\\.js', "g");
    let m;
    while ((m = re.exec(raw))) {
      out.add(m[0].replace(/\\\\/g, "/"));
    }
    return [...out];
  } catch {
    return [];
  }
}

function sumChunksFromClientManifest(manifestAbsPath) {
  const refs = extractChunkRefsFromClientManifest(manifestAbsPath);
  let bytes = 0;
  for (const ref of refs) {
    const p = `.next/${ref}`;
    const hit = entries.find((e) => e.path === p);
    if (hit) bytes += hit.size;
  }
  return { bytes, refsCount: refs.length };
}

const manifestHome = path.join(dist, "server", "app", "(main)", "community-messenger", "page_client-reference-manifest.js");
const manifestRoom = path.join(dist, "server", "app", "(main)", "community-messenger", "rooms", "[roomId]", "page_client-reference-manifest.js");
const manifestCall = path.join(dist, "server", "app", "(main)", "community-messenger", "calls", "[sessionId]", "page_client-reference-manifest.js");

const home = sumChunksFromClientManifest(manifestHome);
const room = sumChunksFromClientManifest(manifestRoom);
const call = sumChunksFromClientManifest(manifestCall);

console.log(`[bundle-budget] messenger home js: ${formatKb(home.bytes)} (budget ${MESSENGER_HOME_BUDGET_KB} KB, refs ${home.refsCount})`);
console.log(`[bundle-budget] messenger room js: ${formatKb(room.bytes)} (budget ${MESSENGER_ROOM_BUDGET_KB} KB, refs ${room.refsCount})`);
console.log(`[bundle-budget] messenger call js: ${formatKb(call.bytes)} (budget ${MESSENGER_CALL_BUDGET_KB} KB, refs ${call.refsCount})`);

if (Math.round(home.bytes / 1024) > MESSENGER_HOME_BUDGET_KB) {
  console.error(`[bundle-budget] FAIL: messenger home js exceeds budget`);
  process.exit(3);
}
if (Math.round(room.bytes / 1024) > MESSENGER_ROOM_BUDGET_KB) {
  console.error(`[bundle-budget] FAIL: messenger room js exceeds budget`);
  process.exit(4);
}
if (Math.round(call.bytes / 1024) > MESSENGER_CALL_BUDGET_KB) {
  console.error(`[bundle-budget] FAIL: messenger call js exceeds budget`);
  process.exit(5);
}

