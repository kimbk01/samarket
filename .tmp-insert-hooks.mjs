import fs from "fs";

const dirs = [
  "ops-knowledge-graph",
  "ops-learning",
  "ops-routines",
  "ops-runbooks",
  "ops-maturity",
  "ops-knowledge",
];

for (const d of dirs) {
  for (const f of fs.readdirSync(`components/admin/${d}`)) {
    if (!f.endsWith(".tsx")) continue;
    const fp = `components/admin/${d}/${f}`;
    let c = fs.readFileSync(fp, "utf8");
    if (!c.includes('t("admin_ops')) continue;
    if (c.includes("const { t } = useI18n()")) continue;
    let n = c.replace(/(\}: [^)]+\) \{)\r?\n/, "$1\n  const { t } = useI18n();\n");
    if (n === c) {
      n = c.replace(
        /(export function \w+\(\{[^}]+\}: \w+Props\) \{)\r?\n/,
        "$1\n  const { t } = useI18n();\n"
      );
    }
    if (!n.includes("const { t } = useI18n()")) {
      console.log("fail", fp);
      continue;
    }
    fs.writeFileSync(fp, n);
    console.log("ok", fp);
  }
}
