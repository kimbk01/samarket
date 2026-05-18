import fs from "node:fs";
import path from "node:path";

const roots = ["components/stores/owner", "components/business"];
const ext = new Set([".ts", ".tsx"]);
const misses = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!ext.has(path.extname(entry.name))) continue;
    const src = fs.readFileSync(full, "utf8");
    if (src.includes('t("') && !src.includes("const { t } = useI18n();")) {
      misses.push(full.replaceAll("\\", "/"));
    }
  }
}

for (const root of roots) {
  walk(root);
}

for (const file of misses) {
  console.log(file);
}
console.log(`COUNT=${misses.length}`);
