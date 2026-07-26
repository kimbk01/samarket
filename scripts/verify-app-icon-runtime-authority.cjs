/**
 * App Icon runtime authority — NativeBadgeSync reads domain-badge-surface-store only.
 * app-icon-badge-projection remains Phase H contract mirror (not a runtime reader source).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const native = read("components/push/NativeBadgeSync.tsx");
if (!native.includes("subscribeDomainBadgeSurface")) {
  failures.push("NativeBadgeSync must subscribe domain-badge-surface-store");
}
if (!native.includes("getDomainBadgeSurfaceSnapshot")) {
  failures.push("NativeBadgeSync must read domain-badge-surface-store snapshot");
}
if (/getAppIconBadgeProjection|from\s+["']@\/lib\/chat-domain\/projections\/app-icon-badge-projection["']/.test(native)) {
  failures.push("NativeBadgeSync must not import app-icon-badge-projection");
}
if (/generation\s*>\s*0/.test(native)) {
  failures.push("NativeBadgeSync must not use generation=0 fallback");
}
if (/subscribeOwnerHubBadge|getOwnerHubBadgeSnapshot|owner-hub-badge-store/.test(native)) {
  failures.push("NativeBadgeSync must not read Owner hub");
}

const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
if (!bridge.includes("applyOwnerHubSurfacesFromProjection")) {
  failures.push("bridge must isolate Owner hub apply helper");
}
if (!bridge.includes("applyAppIconRuntimeAuthorityFromProjection")) {
  failures.push("bridge must isolate App Icon runtime publish helper");
}
if (!bridge.includes("publishDomainBadgeShellToSurfaceStore")) {
  failures.push("bridge must publish App Icon 4-axis to domain-badge-surface-store");
}

const surface = read("lib/messenger/contracts/domain-badge-surface-store.ts");
if (!surface.includes("resolveDomainAppIconBadgeCount")) {
  failures.push("domain-badge-surface-store must keep Domain App Icon formula");
}
if (/owner-hub-badge-store|subscribeOwnerHubBadge/.test(surface)) {
  failures.push("domain-badge-surface-store must not import Owner hub");
}

if (failures.length) {
  console.error("[verify:app-icon-runtime-authority] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  "[verify:app-icon-runtime-authority] OK — NativeBadgeSync runtime reader is domain-badge-surface-store only"
);
