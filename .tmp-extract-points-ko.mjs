import fs from "node:fs";
import path from "node:path";

const paths = [
  "components/admin/notifications",
  "components/admin/points",
  "components/admin/point-policies",
  "components/admin/point-executions",
];
const H = /[\u3131-\u318E\uAC00-\uD7A3]/;

function walk(d, files = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, files);
    else if (/\.tsx?$/.test(e.name)) files.push(f);
  }
  return files;
}

for (const p of paths) {
  for (const f of walk(p)) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (H.test(line) && !line.trim().startsWith("//")) {
        console.log(`${f}:${i + 1}:${line.trim().slice(0, 140)}`);
      }
    });
  }
}
