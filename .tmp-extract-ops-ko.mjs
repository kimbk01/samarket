import fs from "fs";
import path from "path";

const dirs = [
  "ops-knowledge-graph",
  "ops-learning",
  "ops-routines",
  "ops-runbooks",
  "ops-maturity",
  "ops-knowledge",
  "ops-board",
];
const ko = /[\uAC00-\uD7A3][\uAC00-\uD7A3\s·/·:：()（）\w\-.,!?？"'&;]+/g;
const set = new Set();
for (const d of dirs) {
  const root = path.join("components/admin", d);
  for (const f of fs.readdirSync(root)) {
    if (!/\.tsx?$/.test(f)) continue;
    const t = fs.readFileSync(path.join(root, f), "utf8");
    const m = t.match(ko) || [];
    m.forEach((s) => set.add(s.trim()));
  }
}
const list = [...set].sort();
console.log(list.join("\n"));
console.error("count", list.length);
