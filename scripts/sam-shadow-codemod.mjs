import fs from "node:fs";
import path from "node:path";

function walkComponents(dir, adminRoot, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (adminRoot && (p === adminRoot || p.startsWith(`${adminRoot}${path.sep}`))) continue;
      walkComponents(p, adminRoot, out);
    } else if (name.isFile() && name.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

function walkApp(dir, adminRoot, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (adminRoot && (p === adminRoot || p.startsWith(`${adminRoot}${path.sep}`))) continue;
      walkApp(p, adminRoot, out);
    } else if (name.isFile() && name.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

function patchFiles(files) {
  let n = 0;
  for (const file of files) {
    const s = fs.readFileSync(file, "utf8");
    if (!s.includes("shadow-lg")) continue;
    const next = s.replace(/shadow-lg/g, "shadow-sam-elevated");
    if (next !== s) {
      fs.writeFileSync(file, next, "utf8");
      n++;
    }
  }
  return n;
}

const compAdmin = path.join(process.cwd(), "components", "admin");
const appAdmin = path.join(process.cwd(), "app", "admin");
const a = patchFiles(walkComponents(path.join(process.cwd(), "components"), compAdmin));
const b = patchFiles(walkApp(path.join(process.cwd(), "app"), appAdmin));
console.log("components files:", a, "app files:", b);
