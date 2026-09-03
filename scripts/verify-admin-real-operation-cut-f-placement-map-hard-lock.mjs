#!/usr/bin/env node
/**
 * CUT F — Full App Placement Map + preview read-model gate.
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

const anchor = "lib/admin/admin-real-operation-cut-f-placement-map-hard-lock.ts";
const doc = "docs/dibay-admin-real-operation-cut-f-placement-map-hard-lock.md";
const model = "lib/admin/placement-map-read-model.ts";
const panel = "components/admin/stores/AdminPlacementMapPanel.tsx";
const inventory = "components/admin/stores/AdminDeliveryAdInventoryManagementView.tsx";

for (const f of [anchor, doc, model, panel, inventory]) {
  if (!existsSync(resolve(root, f))) fail(`missing ${f}`);
}

const a = read(anchor);
for (const s of [
  "ADMIN_REAL_OPERATION_CUT_F_LOCKED = true",
  "adapterOverSeparateRegistries: true",
  "newDbForbidden: true",
  'mutationOwner: "CANONICAL_DOMAIN_ONLY"',
  "hardcodedMarkerCoordinatesForbidden: true",
  "fakeActiveCountForbidden: true",
  "searchTopMayBeRuntimeWithoutSellable: true",
  'tabletPlacementMap: "NOT_PROVEN"',
  'popupRuntimeProduction: "NOT_PROVEN"',
]) {
  if (!a.includes(s)) fail(`anchor missing: ${s}`);
}

const m = read(model);
if (!m.includes('PLACEMENT_MAP_ENTRY = "/admin/delivery-ads/inventory"')) {
  fail("map entry must be inventory route");
}
if (!m.includes("listDeliveryPlacementMapRows")) fail("delivery adapter missing");
if (!m.includes("listFeedPlacementMapRows")) fail("feed adapter missing");
if (!m.includes("listPopupPlacementMapRows")) fail("popup adapter missing");
if (!m.includes("assertDeliveryPreviewKeysInRegistry")) {
  fail("preview↔registry assert missing");
}
if (m.includes("CREATE TABLE") || m.includes("from(\"placement_map")) {
  fail("forbidden placement map DB");
}

const inv = read(inventory);
if (!inv.includes("AdminPlacementMapPanel")) {
  fail("inventory must mount AdminPlacementMapPanel");
}

const p = read(panel);
if (!p.includes('data-admin-placement-map="1"')) fail("panel marker missing");
if (!p.includes("data-admin-placement-marker")) fail("placement markers missing");
if (p.includes("top: 120px") || p.includes("left: 20px")) {
  fail("hardcoded marker coordinates forbidden");
}

const detail = read("components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx");
if (!detail.includes("placementMapFocusHref")) {
  fail("ads detail must deep-link placement map");
}
if (!detail.includes("admin_delivery_ads_view_app_placement")) {
  fail("ads detail CTA key missing");
}

const home = read("components/admin/stores/AdminStoresHomeShelvesPage.tsx");
if (!home.includes("data-admin-home-placement-map-link")) {
  fail("HOME config → map link missing");
}

const cat = read("components/admin/stores/AdminStoresCategoryPolicyPage.tsx");
if (!cat.includes("data-admin-category-placement-map-link")) {
  fail("CATEGORY config → map link missing");
}

const center = read("components/admin/dashboard/AdminActionCenter.tsx");
if (!center.includes("data-admin-action-center-placement-map")) {
  fail("Action Center placement map link missing");
}

for (const shell of [
  "app/admin/placement-map-v2/page.tsx",
  "app/admin/ads-placement-map/page.tsx",
  "app/admin/unified-placement/page.tsx",
]) {
  if (existsSync(resolve(root, shell))) fail(`forbidden shell: ${shell}`);
}

ok("CUT F Placement Map hard lock");
process.exit(0);
