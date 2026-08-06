/**
 * Slice 2.5 — Design System + Accessibility HARD LOCK structural verify.
 *   npm run verify:design-system-hard-lock
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const failures = [];

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    failures.push(`missing: ${rel}`);
    return "";
  }
  return readFileSync(p, "utf8");
}

const lock = read("lib/ui/design-system-hard-lock.ts");
const tokens = read("app/design-tokens.css");
const sam = read("lib/ui/sam-component-classes.ts");
const comps = read("app/samarket-components.css");
const doc = read("docs/customer-platform/04-DESIGN-SYSTEM.md");

for (const sym of [
  "DESIGN_SYSTEM_BRAND",
  "DESIGN_SYSTEM_A11Y",
  "DESIGN_SYSTEM_COLOR_TOKENS",
  "touchTargetMinPx",
  "contrastRatioMin",
  "primaryHex",
]) {
  if (!lock.includes(sym)) failures.push(`hard-lock module missing: ${sym}`);
}

if (!lock.includes("#0B421A") || !lock.includes("--dibay-green")) {
  failures.push("brand primary must lock to --dibay-green #0B421A");
}
if (!lock.includes("44") || !/touchTargetMinPx:\s*44/.test(lock)) {
  failures.push("a11y touchTargetMinPx must be 44");
}
if (!/contrastRatioMin:\s*4\.5/.test(lock)) {
  failures.push("a11y contrastRatioMin must be 4.5");
}

if (!tokens.includes("--dibay-green: #0B421A")) {
  failures.push("design-tokens.css must define --dibay-green: #0B421A");
}
if (!tokens.includes("--sam-tap-min: 44px")) {
  failures.push("design-tokens.css must keep --sam-tap-min: 44px");
}
if (!tokens.includes("--sam-primary")) {
  failures.push("design-tokens.css missing --sam-primary");
}

for (const cls of ["sam-btn-primary", "sam-btn-danger", "sam-card", "sam-input", "sam-list-row"]) {
  if (!sam.includes(`"${cls}"`) && !sam.includes(`'${cls}'`) && !sam.includes(cls)) {
    // Sam object uses string values
    if (!new RegExp(`${cls}`).test(sam)) failures.push(`sam-component-classes missing ${cls}`);
  }
  if (!comps.includes(`.${cls}`) && !comps.includes(cls.replace("sam-btn-", "sam-btn--"))) {
    // primary may be .sam-btn-primary or .sam-btn--primary
    const alt = cls.includes("btn-") ? cls.replace("sam-btn-", "sam-btn--") : null;
    if (!comps.includes(`.${cls}`) && !(alt && comps.includes(`.${alt}`))) {
      failures.push(`samarket-components.css missing .${cls}`);
    }
  }
}

if (/Color Token \| TBD|Typography \| TBD|Touch Target \| 최소 터치/.test(doc)) {
  failures.push("04-DESIGN-SYSTEM.md still has TBD / unlocked a11y placeholders");
}
if (!doc.includes("HARD LOCK") || !doc.includes("4.5:1") || !doc.includes("44")) {
  failures.push("04-DESIGN-SYSTEM.md must record HARD LOCK contrast 4.5:1 and 44px tap");
}
if (!doc.includes("design-system-hard-lock")) {
  failures.push("04-DESIGN-SYSTEM.md must point at design-system-hard-lock.ts");
}

// Ban karrot orange as brand primary in hard-lock module
if (/#FF6F0F|#ff6f0f|karrot.*primary/i.test(lock)) {
  failures.push("karrot orange must not appear as design-system brand primary");
}

if (failures.length) {
  console.error("[verify:design-system-hard-lock] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:design-system-hard-lock] OK");
