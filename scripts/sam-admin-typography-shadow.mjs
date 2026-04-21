/**
 * app/admin, components/admin 만: text-[Npx] → sam-text-*, shadow-lg → shadow-sam-elevated
 */
import fs from "node:fs";
import path from "node:path";

const TARGETS = [path.join(process.cwd(), "components", "admin"), path.join(process.cwd(), "app", "admin")];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out);
    else if (name.isFile() && name.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function mapPxToClass(px) {
  const n = Math.round(Number(px));
  if (n <= 11) return "sam-text-xxs";
  if (n === 12) return "sam-text-helper";
  if (n === 13) return "sam-text-body-secondary";
  if (n <= 15) return "sam-text-body";
  if (n === 16) return "sam-text-body-lg";
  if (n === 17) return "sam-text-section-title";
  if (n <= 20) return "sam-text-page-title";
  return "sam-text-hero";
}

const TEXT_PX_RE = /text-\[(\d+(?:\.\d+)?)px\]/g;

let n = 0;
for (const root of TARGETS) {
  for (const file of walk(root)) {
    let s = fs.readFileSync(file, "utf8");
    const a = s.replace(TEXT_PX_RE, (_, p) => mapPxToClass(p));
    const b = a.replace(/shadow-lg/g, "shadow-sam-elevated");
    if (b !== s) {
      fs.writeFileSync(file, b, "utf8");
      n++;
      console.log(path.relative(process.cwd(), file));
    }
  }
}
console.log("admin files updated:", n);
