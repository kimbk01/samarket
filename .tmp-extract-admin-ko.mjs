import fs from "fs";
import path from "path";

const dirs = [
  "qa-board",
  "dev-sprints",
  "launch-week",
  "launch-readiness",
  "reviews",
  "security",
  "member-benefits",
  "production-migration",
  "ops-benchmarks",
  "recommendation-deployments",
  "feed-emergency",
  "recommendation",
  "performance",
  "personalized-feed",
  "exposure",
  "my",
  "home-feed",
  "operations",
  "dr",
];

const koRe = /[\uAC00-\uD7A3][\uAC00-\uD7A3a-zA-Z0-9_·/().,%:+\-—\s]{0,120}/g;
const strings = new Map();

for (const dir of dirs) {
  const root = path.join("components/admin", dir);
  if (!fs.existsSync(root)) continue;
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(e.name)) {
        const text = fs.readFileSync(p, "utf8");
        if (text.includes("useI18n") && !text.match(/[\uAC00-\uD7A3]/)) continue;
        let m;
        while ((m = koRe.exec(text)) !== null) {
          const s = m[0].trim();
          if (s.length < 2) continue;
          if (!strings.has(s)) strings.set(s, []);
          strings.get(s).push(path.relative("components/admin", p).replace(/\\/g, "/"));
        }
      }
    }
  }
  walk(root);
}

const sorted = [...strings.entries()].sort((a, b) => b[1].length - a[1].length);
console.log("unique:", sorted.length);
for (const [s, files] of sorted.slice(0, 80)) {
  console.log(JSON.stringify(s));
}
