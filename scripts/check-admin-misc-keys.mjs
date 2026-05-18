import fs from "fs";
const cat = fs.readFileSync("lib/i18n/catalog/admin-misc.ts", "utf8");
const keys = new Set([...cat.matchAll(/^\s+(admin_[^:]+):/gm)].map((m) => m[1]));
const dirs = [
  "qa-board", "launch-week", "launch-readiness", "reviews", "security",
  "member-benefits", "production-migration", "ops-benchmarks",
  "recommendation-deployments", "feed-emergency", "recommendation",
  "performance", "personalized-feed", "exposure", "my", "home-feed", "dr",
];
const missing = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e.name)) {
      const t = fs.readFileSync(p, "utf8");
      for (const m of t.matchAll(/t\("((?:admin_|common_)[^"]+)"\)/g)) {
        if (!keys.has(m[1]) && !m[1].startsWith("common_"))
          missing.push(`${p}: ${m[1]}`);
      }
    }
  }
}
for (const dir of dirs) walk(`components/admin/${dir}`);
console.log("missing", missing.length);
console.log(missing.slice(0, 40).join("\n"));
