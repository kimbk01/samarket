import fs from "fs";
import path from "path";

const FOLDERS = [
  "ops-knowledge-graph",
  "ops-learning",
  "ops-routines",
  "ops-runbooks",
  "ops-maturity",
  "ops-knowledge",
];

const files = [];
for (const folder of FOLDERS) {
  const dir = path.join("components/admin", folder);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".tsx")) continue;
    const fp = path.join(dir, f);
    const c = fs.readFileSync(fp, "utf8");
    if (c.includes('t("admin_ops') && !c.includes("useI18n")) files.push(fp);
  }
}

for (const fp of files) {
  let c = fs.readFileSync(fp, "utf8");
  c = c.replace(
    '"use client";\n\n',
    '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n'
  );
  if (!c.includes("const { t } = useI18n()")) {
    c = c.replace(/(export function \w+[^{]*\{)\n/, "$1\n  const { t } = useI18n();\n");
  }
  if (c.includes("opsToolsLabel") && !c.includes("admin-ops-tools-label-keys")) {
    const maps = new Set();
    for (const m of c.matchAll(/OPS_TOOLS_\w+/g)) maps.add(m[0]);
    const imp = `import {\n  ${[...maps, "opsToolsLabel"].join(",\n  ")},\n} from "@/components/admin/i18n/admin-ops-tools-label-keys";\n`;
    c = c.replace(/import \{ useI18n \}[^\n]+\n/, `$&${imp}`);
  }
  if (c.includes("tab.labelKey") && !c.includes("MessageKey")) {
    c = c.replace(
      /import \{ useI18n \}[^\n]+\n/,
      `$&import type { MessageKey } from "@/lib/i18n/messages";\n`
    );
    c = c.replace(/\{tab\.label\}/g, "{t(tab.labelKey)}");
  }
  fs.writeFileSync(fp, c);
  console.log("fixed", fp);
}
console.log("count", files.length);
