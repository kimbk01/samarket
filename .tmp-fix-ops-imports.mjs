import fs from "fs";
import path from "path";

const FOLDERS = [
  "ops-board",
  "ops-knowledge-graph",
  "ops-learning",
  "ops-routines",
  "ops-runbooks",
  "ops-maturity",
  "ops-knowledge",
];

for (const folder of FOLDERS) {
  for (const f of fs.readdirSync(path.join("components/admin", folder))) {
    if (!f.endsWith(".tsx")) continue;
    const fp = path.join("components/admin", folder, f);
    let c = fs.readFileSync(fp, "utf8");
    if (!c.includes("opsToolsLabel(") && !c.includes('t("admin_ops')) continue;
    const maps = new Set();
    for (const m of c.matchAll(/OPS_TOOLS_\w+/g)) maps.add(m[0]);
    if (maps.size === 0 && c.includes('t("admin_ops') && !c.includes("const { t }")) {
      c = c.replace(/export function (\w+)\(([\s\S]*?)\) \{\n/, (full, name, params) => {
        if (full.includes("const { t }")) return full;
        return `export function ${name}(${params}) {\n  const { t } = useI18n();\n`;
      });
    }
    if (c.includes("opsToolsLabel(") && !c.includes("admin-ops-tools-label-keys")) {
      const imp = `import {\n  ${[...maps, "opsToolsLabel"].filter(Boolean).join(",\n  ")},\n} from "@/components/admin/i18n/admin-ops-tools-label-keys";\n`;
      if (c.includes("useI18n")) {
        c = c.replace(/import \{ useI18n \}[^\n]+\n/, `$&${imp}`);
      } else {
        c = c.replace(/"use client";\s*\n/, `"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n${imp}`);
      }
    }
    if (c.includes('t("admin_ops') && !c.includes("const { t } = useI18n()")) {
      c = c.replace(/export function (\w+)\(([\s\S]*?)\) \{\n/, (full, name, params) => {
        if (full.includes("const { t }")) return full;
        return `export function ${name}(${params}) {\n  const { t } = useI18n();\n`;
      });
    }
    fs.writeFileSync(fp, c);
  }
}
console.log("done");
