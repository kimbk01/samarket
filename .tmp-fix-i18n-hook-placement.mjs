import fs from "node:fs";
import path from "node:path";

const ROOT = "c:/samarket";
const DIRS = [
  "components/admin/points",
  "components/admin/point-policies",
  "components/admin/point-executions",
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name.endsWith(".tsx")) out.push(f);
  }
  return out;
}

const re =
  /export function (\w+)\(\{\r?\n  const \{ t \} = useI18n\(\);\r?\n([\s\S]*?)\r?\n\}: (\w+)\) \{/g;

let n = 0;
for (const dir of DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    let src = fs.readFileSync(file, "utf8");
    if (!re.test(src)) continue;
    src = fs.readFileSync(file, "utf8");
    const next = src.replace(re, "export function $1({\n$2\n}: $3) {\n  const { t } = useI18n();\n");
    if (next !== src) {
      fs.writeFileSync(file, next);
      n++;
      console.log(path.relative(ROOT, file));
    }
  }
}
console.log("fixed", n);
