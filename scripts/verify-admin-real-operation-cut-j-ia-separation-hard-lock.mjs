#!/usr/bin/env node
/**
 * CUT J — Domain / Common Operation IA separation hard lock.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`OK: ${msg}`);

const anchor = "lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock.ts";
const doc = "docs/dibay-admin-real-operation-cut-j-ia-separation-hard-lock.md";
const menu = "components/admin/admin-menu.ts";
const routing = "lib/admin/admin-workspace-routing.ts";

for (const f of [anchor, doc, menu, routing]) {
  if (!existsSync(resolve(root, f))) fail(`missing ${f}`);
}

const a = read(anchor);
for (const s of [
  "ADMIN_REAL_OPERATION_CUT_J_LOCKED = true",
  "duplicatePrimaryLeafForbidden: true",
  'placementMapIsConfigWriter: false',
  'homeConfigWorkspace: "delivery"',
  'deliveryAdsOpsWorkspace: "ads"',
  'financeF1F3F4F7: "NOT_PROVEN"',
  'adsApplyActiveApp: "NOT_PROVEN"',
  'resetStorage: "NOT_IMPLEMENTED"',
  // J-AMD-1 Owner-approved SSOT (target order; live menu unchanged until impl auth)
  "CUT_J_J_AMD_1_OWNER_APPROVED = true",
  "CUT_J_WORKSPACE_ORDER_J_AMD_1",
  'fullWorkspaceReorder_J_AMD_2: true',
  'adsPromotionSingleParent_B_X1: true',
  "cutJFullUnlock: true",
  // J-AMD-5 Owner-approved (design v4 O-1..O-3)
  "CUT_J_J_AMD_5_OWNER_APPROVED = true",
  "CUT_J_J_AMD_5_INTERNAL_TOOLS",
  "CUT_J_J_AMD_5_REMOVED_LEAVES",
  "CUT_J_J_AMD_5_ADDED_STAFF_LEAF",
]) {
  if (!a.includes(s)) fail(`anchor missing: ${s}`);
}

const m = read(menu);
if (!m.includes('key: "finance"')) fail("menu missing finance workspace");
if (!m.includes('key: "ads"')) fail("menu missing ads workspace");
if (!m.includes('key: "support"')) fail("menu missing support workspace");
if (!m.includes('key: "notifications"')) fail("menu missing notifications workspace");
// Top-level common/growth dissolved; growth-rec section under promotion is OK (J-AMD-5)
if (!m.includes("// ── FINANCE") || !m.includes("// ── ADS")) {
  fail("menu missing CUT J section markers");
}
if (m.includes("// ── COMMON") || m.includes("// ── GROWTH")) {
  fail("common/growth section markers must stay dissolved");
}
if (/\n  \{\n    key: "growth",/.test(m)) {
  fail("top-level growth workspace must be dissolved");
}
if (/\n  \{\n    key: "common",/.test(m)) {
  fail("top-level common workspace must be dissolved");
}
const r = read(routing);
for (const id of [
  '"dashboard"',
  '"members"',
  '"delivery"',
  '"trade"',
  '"community"',
  '"messenger"',
  '"finance"',
  '"ads"',
  '"support"',
  '"notifications"',
  '"system"',
]) {
  if (!r.includes(id)) fail(`routing missing workspace id ${id}`);
}
if (!m.includes('key: "members"')) fail("menu missing members workspace (J-AMD-1)");

for (const shell of [
  "app/admin/ads-v2/page.tsx",
  "app/admin/growth-v2/page.tsx",
  "app/admin/finance-v2/page.tsx",
  "app/admin/support-v2/page.tsx",
  "app/admin/control-plane-v2/page.tsx",
]) {
  if (existsSync(resolve(root, shell))) fail(`forbidden shell: ${shell}`);
}

// J-AMD-5: duplicate leaves removed from the menu (URLs kept via coveredBy / matchPaths).
for (const key of ["cp-action-queue", "app-categories", "promotion-notifications"]) {
  if (m.includes(`key: "${key}"`)) fail(`J-AMD-5 removed leaf must not return: ${key}`);
}
// J-AMD-5 (F3): 관리자 계정·권한 leaf — members 마지막, master-only (API requireSuperAdmin).
if (!/key: "audit-logs", title: "", path: "\/admin\/audit-logs", status: "done" \},\n(\s*\/\/.*\n)?\s+\{ key: "admin-staff", title: "", path: "\/admin\/staff", status: "done", roles: \["master"\] \},\n\s+\],/.test(m)) {
  fail("J-AMD-5 admin-staff leaf must be the last master-only members leaf after audit-logs");
}
if (!existsSync(resolve(root, "app/admin/staff/page.tsx"))) fail("J-AMD-5 /admin/staff page missing");
if (!/key: "platform-system",\n\s+title: "",\n\s+roles: \["master"\]/.test(m)) {
  fail("J-AMD-5 internal tools section (platform-system) must stay master-only");
}

if (m.includes('path: "/admin/platform-inquiries"')) {
  fail("platform-inquiries must not be primary nav leaf");
}
if (m.includes('key: "store-point-charges-admin"')) {
  fail("AST-002 store-point-charges-admin must not be primary nav");
}

// Delivery must not own delivery-ads as primary sidebar leaf under operations
const deliveryBlock = m.slice(m.indexOf('key: "delivery"'), m.indexOf('key: "trade"'));
if (deliveryBlock.includes('path: "/admin/delivery-ads"')) {
  fail("delivery workspace must not primary-own /admin/delivery-ads leaf");
}

ok("CUT J IA separation hard lock");
process.exit(0);
