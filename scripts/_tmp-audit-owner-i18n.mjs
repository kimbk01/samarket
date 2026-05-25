import fs from "fs";
import path from "path";

const roots = ["c:/samarket/components/business/owner", "c:/samarket/lib/stores", "c:/samarket/lib/business"];
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
    }
  }
}
for (const r of roots) walk(r);

const cat = fs.readFileSync("c:/samarket/lib/i18n/catalog/store-commerce-ui.ts", "utf8");
const inCat = new Set([...cat.matchAll(/^\s+(store_[a-z0-9_]+):/gm)].map((m) => m[1]));
const missing = [...used].filter((k) => !inCat.has(k)).sort();
console.log("missing", missing.length);
for (const k of missing) console.log(k);
