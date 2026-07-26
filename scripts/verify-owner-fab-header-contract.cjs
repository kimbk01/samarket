/**
 * Owner FAB / Owner Header meaning contract.
 *
 * Owner FAB  = Owner-role store attention only (orders / inquiry+review / store-scoped order chat).
 * Owner Header = same Owner projection sum.
 * Forbidden inputs: Customer buyer_order, General/Group, Trade, App Icon total, Bell unread.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function bodyOf(src, fnName) {
  const start = src.indexOf(`export function ${fnName}`);
  if (start < 0) return null;
  const open = src.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

const policyRel = "lib/stores/owner-store-badge-display-policy.ts";
const policy = read(policyRel);

/** Axis that must never feed an Owner FAB/Header resolver. */
const FORBIDDEN_OWNER_AXES = [
  "buyerOrderAttention",
  "communityMessengerUnread",
  "chatUnread",
  "socialChatUnread",
  "philifeChatUnread",
  "appIconTotal",
  "storesTabAttention",
];

const OWNER_RESOLVERS = [
  "resolveFabOwnerOrdersBadgeCount",
  "resolveFabOwnerStoreBadgeCount",
  "resolveFabOwnerOrderChatBadgeCount",
];

for (const fn of OWNER_RESOLVERS) {
  const body = bodyOf(policy, fn);
  if (!body) {
    failures.push(`${policyRel}: missing Owner resolver ${fn}`);
    continue;
  }
  for (const axis of FORBIDDEN_OWNER_AXES) {
    if (body.includes(axis)) {
      failures.push(`${policyRel}: ${fn} must not read ${axis}`);
    }
  }
}

const ordersBody = bodyOf(policy, "resolveFabOwnerOrdersBadgeCount") ?? "";
if (!ordersBody.includes("orderAttention")) {
  failures.push(`${policyRel}: FAB orders badge must read orderAttention`);
}

const storeBody = bodyOf(policy, "resolveFabOwnerStoreBadgeCount") ?? "";
if (!storeBody.includes("inquiryAttention") || !storeBody.includes("ownerReviewAttention")) {
  failures.push(`${policyRel}: FAB store badge must read inquiryAttention + ownerReviewAttention`);
}
if (storeBody.includes("orderAttention") || storeBody.includes("storeOrderChatUnread")) {
  failures.push(`${policyRel}: FAB store badge must exclude order / order-chat axes`);
}

const orderChatBody = bodyOf(policy, "resolveFabOwnerOrderChatBadgeCount") ?? "";
if (!orderChatBody.includes("storeOrderChatUnread")) {
  failures.push(`${policyRel}: FAB order chat badge must read store-scoped storeOrderChatUnread`);
}
if (orderChatBody.includes("storeOrderOwnerUnreadRooms")) {
  failures.push(
    `${policyRel}: FAB order chat badge must not read global owner aggregate storeOrderOwnerUnreadRooms`
  );
}

const headerBody = bodyOf(policy, "resolveOwnerOperationsCenterAttentionCount") ?? "";
if (!headerBody) {
  failures.push(`${policyRel}: missing Owner header operations attention resolver`);
} else {
  for (const fn of OWNER_RESOLVERS) {
    if (!headerBody.includes(fn)) {
      failures.push(`${policyRel}: Owner header attention must compose ${fn}`);
    }
  }
  for (const axis of FORBIDDEN_OWNER_AXES) {
    if (headerBody.includes(axis)) {
      failures.push(`${policyRel}: Owner header attention must not read ${axis}`);
    }
  }
}

/** Owner surfaces must not import App Icon / Bell / Bottom Chat sources. */
const FORBIDDEN_SURFACE_IMPORTS = [
  ["domain-badge-surface-store", "App Icon surface store"],
  ["app-icon-badge-projection", "App Icon projection"],
  ["messenger-bottom-chat-unread-projection", "Bottom Chat projection"],
  ["messenger-chat-tab-badge", "Bottom Chat badge"],
  ["notification-badge-count-store", "Bell unread store"],
  ["notification-unread-badge-store", "Bell unread store"],
];

const ownerSurfaceFiles = [
  "components/layout/MainBottomNavFabSector.tsx",
  "components/stores/StoresRootTier1HeaderActions.tsx",
];

for (const rel of ownerSurfaceFiles) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`missing Owner surface file: ${rel}`);
    continue;
  }
  const src = read(rel);
  for (const [needle, label] of FORBIDDEN_SURFACE_IMPORTS) {
    if (src.includes(needle)) {
      failures.push(`${rel}: Owner surface must not read ${label} (${needle})`);
    }
  }
  if (/appIconTotal/.test(src)) {
    failures.push(`${rel}: Owner surface must not read App Icon total`);
  }
}

if (failures.length) {
  console.error("[verify:owner-fab-header-contract] FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  "[verify:owner-fab-header-contract] OK — Owner FAB/Header read Owner-role attention axes only"
);
