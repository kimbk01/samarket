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
    if (!c.includes('t("admin_ops') || c.includes("const { t } = useI18n()")) continue;
    if (!c.includes("useI18n")) {
      c = c.replace(
        /"use client";\s*\n/,
        '"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n'
      );
    }
    const next = c.replace(
      /(\}: [^)]+\) \{\n)(?!\s*const \{ t \})/,
      "$1  const { t } = useI18n();\n"
    );
    if (next === c) {
      const next2 = c.replace(
        /(export function \w+\([^)]*\) \{\n)(?!\s*const \{ t \})/,
        "$1  const { t } = useI18n();\n"
      );
      if (next2 !== c) {
        fs.writeFileSync(fp, next2);
        console.log("hook2", fp);
      } else {
        console.warn("fail", fp);
      }
    } else {
      fs.writeFileSync(fp, next);
      console.log("hook", fp);
    }
  }
}
