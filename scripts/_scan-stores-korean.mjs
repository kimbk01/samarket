import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["components/stores", "app/(main)/stores"];
const skip = [/[/\\]__tests__[/\\]/, /browse-mock/];
const H = /[\uAC00-\uD7A3]/;
const STR = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

function walk(d, out = []) {
  const full = path.join(ROOT, d);
  if (!fs.existsSync(full)) return out;
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    const f = path.join(full, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(path.relative(ROOT, f), out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(f);
    }
  }
  return out;
}

const findings = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (skip.some((s) => s.test(rel))) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/**")) return;
      if (!H.test(line)) return;
      let m;
      STR.lastIndex = 0;
      while ((m = STR.exec(line))) {
        const s = m[0];
        if (H.test(s)) {
          findings.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
        }
      }
    });
  }
}

console.log(`count ${findings.length}`);
for (const f of findings) console.log(f);
