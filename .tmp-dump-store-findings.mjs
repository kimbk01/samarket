import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "owner") continue;
      walk(p, out);
    } else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = walk("components/stores");
const all = [];
for (const f of files) {
  let out = "";
  try {
    out = execSync(`node scripts/check-hardcoded-korean.mjs "${f.replace(/\\/g, "/")}"`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
  }
  for (const line of out.split("\n")) {
    const m = line.match(/^\s+(.+\.tsx:\d+): (.+)$/);
    if (m) all.push({ file: m[1], snippet: m[2].trim() });
  }
}
fs.writeFileSync(".tmp-store-findings.json", JSON.stringify(all, null, 2));
console.log("total findings", all.length);
