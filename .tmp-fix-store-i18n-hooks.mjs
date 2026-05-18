import fs from "node:fs";
import { execSync } from "node:child_process";

const IMPORT = 'import { useI18n } from "@/components/i18n/AppLanguageProvider";\n';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "owner") continue;
      walk(p, out);
    } else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = walk("components/stores");
let fixed = 0;
for (const rel of files) {
  let c = fs.readFileSync(rel, "utf8");
  if (!c.includes('"use client"') || !c.includes('t("') && !c.includes("t('")) continue;
  if (c.includes("useI18n()")) continue;

  if (!c.includes("useI18n")) {
    const idx = c.indexOf("\n", c.indexOf('"use client"'));
    c = c.slice(0, idx + 1) + IMPORT + c.slice(idx + 1);
  }

  // First exported function body
  const m = c.match(/export function \w+\([\s\S]*?\) \{/);
  if (!m) continue;
  const insertAt = m.index + m[0].length;
  c = c.slice(0, insertAt) + "\n  const { t } = useI18n();" + c.slice(insertAt);
  fs.writeFileSync(rel, c);
  fixed++;
  console.log("fixed", rel);
}
console.log("total", fixed);
