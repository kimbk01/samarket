import fs from "fs";
import path from "path";

const HANGUL = /[\u3131-\u318E\uAC00-\uD7A3]/;
const PATTERNS = [
  />\s*[^<{]*[\u3131-\u318E\uAC00-\uD7A3][^<]*</g,
  /(?:placeholder|title|aria-label|alt)\s*=\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /toast\.(?:success|error|info|warning)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
  /\b(?:alert|confirm)\(\s*["'`][^"'`]*[\u3131-\u318E\uAC00-\uD7A3]/g,
];
const SKIP = ["lib/i18n/catalog", "messages/", "docs/", "__tests__", ".test.", ".spec."];

function walk(d, out = []) {
  if (!fs.existsSync(d)) return out;
  if (fs.statSync(d).isFile()) {
    if (/\.tsx?$/.test(d)) out.push(d);
    return out;
  }
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    walk(path.join(d, e.name), out);
  }
  return out;
}

function hits(file) {
  const norm = file.replace(/\\/g, "/");
  if (SKIP.some((s) => norm.includes(s))) return 0;
  let n = 0;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) continue;
    for (const p of PATTERNS) {
      p.lastIndex = 0;
      if (p.test(line)) n++;
    }
  }
  return n;
}

const buckets = {
  admin: 0,
  stores_business: 0,
  mypage_my: 0,
  messenger: 0,
  trade_write: 0,
  community_philife: 0,
  ads: 0,
  app_main: 0,
  app_other: 0,
  components_other: 0,
};

for (const f of walk("components")) {
  const n = hits(f);
  if (!n) continue;
  const p = f.replace(/\\/g, "/");
  if (p.includes("components/admin")) buckets.admin += n;
  else if (p.includes("components/stores") || p.includes("components/business"))
    buckets.stores_business += n;
  else if (p.includes("components/mypage") || p.includes("components/my")) buckets.mypage_my += n;
  else if (p.includes("community-messenger")) buckets.messenger += n;
  else if (
    p.includes("components/trade") ||
    p.includes("components/write") ||
    p.includes("components/home") ||
    p.includes("components/search")
  )
    buckets.trade_write += n;
  else if (p.includes("components/community") || p.includes("components/meetings"))
    buckets.community_philife += n;
  else if (p.includes("components/ads")) buckets.ads += n;
  else buckets.components_other += n;
}

for (const f of walk("app")) {
  const n = hits(f);
  if (!n) continue;
  const p = f.replace(/\\/g, "/");
  if (p.includes("app/(main)") || p.includes("app\\(main)")) buckets.app_main += n;
  else if (p.includes("app/admin") || p.includes("app/login")) buckets.admin += n;
  else buckets.app_other += n;
}

const total = Object.values(buckets).reduce((a, b) => a + b, 0);
const doneDomains =
  buckets.admin +
  buckets.stores_business +
  buckets.mypage_my +
  buckets.messenger +
  buckets.trade_write;
const donePct = total ? Math.round((doneDomains / total) * 100) : 100;

console.log("UI-pattern hardcoded hits (app+components):", total);
console.log("by bucket:", buckets);
console.log("claimed-done domains share of REMAINING hits:", donePct + "% (lower is better)");
console.log("inverse rough remaining-in-done-domains:", 100 - donePct + "% of leftovers are in 'done' areas");
