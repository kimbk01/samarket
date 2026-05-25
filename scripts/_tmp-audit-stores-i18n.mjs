import fs from "fs";
import path from "path";

const root = "c:/samarket/components/stores";
const used = new Set();

function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(f)) {
      const t = fs.readFileSync(p, "utf8");
      for (const m of t.matchAll(/["'](store_[a-z0-9_]+)["']/g)) used.add(m[1]);
      for (const m of t.matchAll(/t\(\s*["'](store_[a-z0-9_]+)["']/g)) used.add(m[1]);
    }
  }
}
walk(root);

const msg = fs.readFileSync("c:/samarket/lib/i18n/messages.ts", "utf8");
const catFiles = [...msg.matchAll(/from ["']\.\/catalog\/([^"']+)["']/g)].map((m) => m[1]);
const inCat = new Set();
for (const cf of catFiles) {
  const p = `c:/samarket/lib/i18n/catalog/${cf}.ts`;
  if (!fs.existsSync(p)) continue;
  const c = fs.readFileSync(p, "utf8");
  for (const m of c.matchAll(/^\s+(store_[a-z0-9_]+):/gm)) inCat.add(m[1]);
}
const missing = [...used].filter((k) => !inCat.has(k)).sort();
console.log("used", used.size, "missing", missing.length);
for (const k of missing) console.log(k);
