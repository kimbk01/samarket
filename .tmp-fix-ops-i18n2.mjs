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
    if (!c.includes('t("admin_ops')) continue;
    if (!c.includes("useI18n")) {
      c = c.replace(/"use client";\s*\n/, '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n');
    }
    if (!c.includes("const { t } = useI18n()")) {
      c = c.replace(/(export function \w+[^{]*\{)\s*\n/, "$1\n  const { t } = useI18n();\n");
    }
    c = c.replace(
      /^const ADMIN_NICK = t\("admin_ops_tools_admin_nickname"\);\s*\n/gm,
      ""
    );
    c = c.replace(/ADMIN_NICK/g, "adminNickname");
    if (c.includes("adminNickname") && c.includes("const { t } = useI18n()")) {
      c = c.replace(
        /const \{ t \} = useI18n\(\);\n/,
        'const { t } = useI18n();\n  const adminNickname = t("admin_ops_tools_admin_nickname");\n'
      );
    }
    fs.writeFileSync(fp, c);
  }
}
