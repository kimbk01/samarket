/**
 * Owner hub badge must not be a parallel writer for Bell / Bottom Chat / Customer caches.
 * Poll must be Owner-surface scoped fallback only.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const hub = read("lib/chats/owner-hub-badge-store.ts");
if (!hub.includes("isDeliveryOwnerSurfaceActive")) {
  failures.push("owner-hub-badge-store must gate poll on Owner surface activity");
}
if (!hub.includes("ensureOwnerHubBadgeFallbackPoll")) {
  failures.push("owner-hub-badge-store must use scoped fallback poll helper");
}
if (/pollInterval = setInterval/.test(hub) && !hub.includes("shouldRunOwnerHubBadgeFallbackPoll")) {
  failures.push("owner-hub-badge-store retains ungated setInterval poll");
}

const surface = read("lib/delivery/owner/owner-surface-activity.ts");
if (!surface.includes("markDeliveryOwnerSurfaceActive")) {
  failures.push("owner-surface-activity missing markDeliveryOwnerSurfaceActive");
}

const runtime = read("components/business/owner/OwnerHubRuntimeProvider.tsx");
if (!runtime.includes("markDeliveryOwnerSurfaceActive")) {
  failures.push("OwnerHubRuntimeProvider must mark Owner surface active");
}

const layout = read("components/layout/BottomNav.tsx");
if (/OWNER_HUB_BADGE_POLL_INTERVAL_MS|setInterval\(\(\) => \{\s*scheduleDeferredHubBadgeFetch/.test(layout)) {
  failures.push("BottomNav must not register Owner hub badge poll");
}

if (failures.length) {
  console.error("[verify:delivery-poll-authority] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("[verify:delivery-poll-authority] OK — Owner poll is surface-scoped fallback");
