import fs from "fs";
import path from "path";

const counts = {};
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) {
      const t = fs.readFileSync(p, "utf8");
      const n = (t.match(/[\uAC00-\uD7A3]/g) || []).length;
      if (n) {
        const rel = p.split(path.sep).join("/");
        const seg = rel.replace("components/admin/", "").split("/")[0] || "_root";
        counts[seg] = (counts[seg] || 0) + n;
      }
    }
  }
}
walk("components/admin");
Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(String(v).padStart(5), k));
