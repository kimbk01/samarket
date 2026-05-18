import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const root = "components/admin";
const dirs = new Set();
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name)) dirs.add(path.dirname(p).replace(/\\/g, "/"));
  }
}
walk(root);

const counts = [];
for (const dir of dirs) {
  try {
    execSync(`node scripts/check-hardcoded-korean.mjs "${dir}"`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    const text = (e.stdout || "") + (e.stderr || "");
    const m = text.match(/(\d+) possible/);
    const n = m ? Number(m[1]) : 0;
    if (n > 0) counts.push([n, dir]);
  }
}
counts.sort((a, b) => b[0] - a[0]);
for (const [n, dir] of counts.slice(0, 30)) console.log(`${n}\t${dir}`);
