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
    const before = c;
    c = c.replace(
      /export function \w+\(\{\n  const \{ t \} = useI18n\(\);\n(?:  const adminNickname = t\("admin_ops_tools_admin_nickname"\);\n)?/g,
      (m) => m.replace(/\n  const \{ t \} = useI18n\(\);\n(?:  const adminNickname = t\("admin_ops_tools_admin_nickname"\);\n)?/, "\n")
    );
    if (c.includes("adminNickname") && !c.match(/\}:[^)]+\)\s*\{\n  const \{ t \}/)) {
      c = c.replace(
        /(\}:[^)]+\)\s*\{)\n(?!\s*const \{ t \})/,
        "$1\n  const { t } = useI18n();\n  const adminNickname = t(\"admin_ops_tools_admin_nickname\");\n"
      );
    } else if (c.includes('t("admin_ops') && !c.match(/\}:[^)]+\)\s*\{\n  const \{ t \}/)) {
      c = c.replace(
        /(\}:[^)]+\)\s*\{)\n(?!\s*const \{ t \})/,
        "$1\n  const { t } = useI18n();\n"
      );
    }
    if (c !== before) {
      fs.writeFileSync(fp, c);
      console.log("fixed", fp);
    }
  }
}
