/**
 * Canonical Owner routes live under `/stores/owner/**` and must not re-export legacy `/my/business` pages.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const ownerDir = path.join(root, "app/(main)/stores/owner");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}

const failures = [];
for (const file of walk(ownerDir)) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  if (/from\s+["'][^"']*my\/business/.test(text) || /export\s+\{\s*default\s*\}\s+from\s+["'][^"']*my\/business/.test(text)) {
    failures.push(`${rel}: must not re-export legacy /my/business page`);
  }
}

if (failures.length) {
  console.error("[verify:canonical-owner-routes] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("[verify:canonical-owner-routes] OK — /stores/owner does not re-export /my/business");
