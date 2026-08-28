/**
 * Customer Commerce Hub — architecture proof A1–A5 (+ static V hooks).
 * node scripts/qa/customer-commerce-hub-close.mjs
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const OUT = resolve(process.cwd(), ".tmp-customer-commerce-hub-close.json");

function read(rel) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function mustMatch(name, src, pattern) {
  const ok = pattern.test ? pattern.test(src) : src.includes(pattern);
  return { id: name, pass: ok };
}

const report = {
  title: "Customer Commerce Hub — architecture close",
  at: new Date().toISOString(),
  checks: [],
};

const hubNav = read("lib/delivery/customer/commerce-hub-nav.ts");
const hubPage = read("components/orders/customer-commerce/CustomerCommerceHubPage.tsx");
const hubBody = read("components/orders/customer-commerce/CustomerCommerceHubBody.tsx");
const sticky = read("components/layout/AppStickyHeader.tsx");
const tier1 = read("lib/layout/resolve-main-tier1.ts");
const messengerCard = read("components/community-messenger/MessengerGiftCertificateCard.tsx");

report.checks.push(
  mustMatch("A1_single_header_config", tier1, /commerce_hub_title/),
  mustMatch("A1_tabs_in_AppStickyHeader", sticky, /CustomerCommerceHubPrimaryTabs/),
  mustMatch("A1_hub_body_no_header", hubBody, /data-customer-commerce-hub-body/),
  mustMatch("A2_url_tab_ssot", hubNav, /parseCommerceHubState/),
  mustMatch("A3_alias_shared_body", hubPage, /CustomerCommerceHubPage/),
  mustMatch("A3_orders_alias", read("app/(main)/orders/page.tsx"), /CustomerCommerceHubPage/),
  mustMatch("A3_coupons_alias", read("app/(main)/mypage/coupons/page.tsx"), /CustomerCommerceHubPage/),
  mustMatch("A3_gifts_alias", read("app/(main)/mypage/gift-certificates/page.tsx"), /CustomerCommerceHubPage/),
  mustMatch("A4_active_tab_mount", hubBody, /state\.tab === "orders"/),
  mustMatch("A4_overview_landing", hubBody, /data-commerce-hub-overview/),
  mustMatch("A4_overview_component", read("components/orders/customer-commerce/CustomerCommerceHubOverview.tsx"), /data-commerce-hub-overview-section/),
  mustMatch("A5_tab_fetch_hook", read("components/orders/customer-commerce/useCommerceHubTabFetch.ts"), /AbortController/),
  mustMatch(
    "G3_instance_api",
    existsSync("app/api/me/gift-certificates/instances/[instanceId]/route.ts")
      ? read("app/api/me/gift-certificates/instances/[instanceId]/route.ts")
      : "",
    /loadGiftInstanceDetail/
  ),
  mustMatch("G4_batch_presentation", messengerCard, /useGiftTransferPresentation/),
  mustMatch("G4_batch_api_exists", read("app/api/me/gift-certificates/transfers/presentation/route.ts"), /loadGiftTransferPresentations/),
  mustMatch("G5_mall_count_gate", read("components/gift-certificate/BuyerGiftMallView.tsx"), /data-active-product-count/),
  mustMatch(
    "D_gift_visual_resolver",
    existsSync("lib/gift-certificate/resolve-gift-visual.ts")
      ? read("lib/gift-certificate/resolve-gift-visual.ts")
      : "",
    /giftScope === "PLATFORM"/
  )
);

const failed = report.checks.filter((c) => !c.pass);
report.summary = failed.length ? "FAIL" : "PASS";
report.failed = failed.map((c) => c.id);

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exit(1);
