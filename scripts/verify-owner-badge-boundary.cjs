/**
 * Owner badge/navigation projection boundary for global shell.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const shellFiles = [
  "components/layout/BottomNav.tsx",
  "components/layout/MainDesktopSideNav.tsx",
  "components/layout/MainBottomNavFabSector.tsx",
];

for (const rel of shellFiles) {
  if (!fs.existsSync(path.join(root, rel))) continue;
  const text = read(rel);
  if (/use-owner-lite-store|owner-lite-external-store/.test(text)) {
    failures.push(`${rel}: global shell must use Owner navigation summary, not owner-lite raw Store`);
  }
  if (/owner-store-orders-list-cache|buyer-store-orders-list-snapshot/.test(text)) {
    failures.push(`${rel}: global shell must not import Delivery order list caches`);
  }
}

const summaryHook = "lib/delivery/owner/projections/use-owner-navigation-summary.ts";
if (!fs.existsSync(path.join(root, summaryHook))) {
  failures.push("missing Owner navigation summary hook");
}

const customerHeader = read("components/stores/StoresRootTier1HeaderActions.tsx");
if (/use-owner-lite-store|owner-lite-external-store/.test(customerHeader)) {
  failures.push("StoresRootTier1HeaderActions must not import owner-lite raw Store");
}

if (failures.length) {
  console.error("[verify:owner-badge-boundary] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:owner-badge-boundary] OK — shell uses Owner navigation summary");
