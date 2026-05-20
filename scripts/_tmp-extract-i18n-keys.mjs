import fs from "node:fs";
import path from "node:path";

const roots = ["components", "app", "lib"];
const prefixes = ["addr_ui_", "points_ui_", "point_pay_"];
const keyRe = /\bt\(\s*["']((?:addr_ui_|points_ui_|point_pay_)[a-z0-9_]+)["']/g;
const keyRe2 = /addrUiT\(\s*["'](addr_ui_[a-z0-9_]+)["']/g;
const recordRe = /["']((?:addr_ui_|points_ui_)[a-z0-9_]+)["']\s*:/g;

const keys = new Set();

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walk(p);
    } else if (/\.(tsx?|jsx?)$/.test(ent.name)) {
      const src = fs.readFileSync(p, "utf8");
      for (const re of [keyRe, keyRe2, recordRe]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src))) keys.add(m[1]);
      }
    }
  }
}

for (const r of roots) {
  if (fs.existsSync(r)) walk(r);
}

console.log(JSON.stringify([...keys].sort(), null, 2));
