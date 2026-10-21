/**
 * 4단계 4-2·4-3·4-5 — IA-07(레거시·슬러그 리다이렉트 쿼리 보존) · IA-08(storeId 정규화) · IA-12(섹션·CS 정규화).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLegacyOwnerRedirectHref,
  buildOwnerCareCenterRedirectHref,
  buildSlugOwnerRedirectHref,
  LEGACY_OWNER_PATH_MAP,
  mapLegacyOwnerPath,
  OwnerRoutes,
  SLUG_OWNER_SECTIONS,
} from "@/lib/business/owner-routes";
import {
  buildOwnerStoreIdNormalizedHref,
  isOwnerStoreIdNormalizablePath,
} from "@/lib/business/owner-store-id-normalize";
import { resolveOwnerActiveStoreRow } from "@/lib/delivery/owner/resolve-owner-active-store";
import { normalizeOwnerFinanceSection } from "@/lib/finance/routes";
import { ownerStage4RoutesMessages } from "@/lib/i18n/catalog/owner-stage4-routes";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/** 24 레거시 URL (`/my/business/*` 20 + `/mypage/business/*` 4) → 캐노니컬 1홉. */
const LEGACY_TABLE: ReadonlyArray<readonly [string, string]> = [
  ["/my/business", "/stores/owner"],
  ["/my/business/apply", "/stores/owner/apply"],
  ["/my/business/banners", "/stores/owner/banners"],
  ["/my/business/basic-info", "/stores/owner/basic-info"],
  ["/my/business/edit", "/stores/owner/profile"],
  ["/my/business/inquiries", "/stores/owner/inquiries"],
  ["/my/business/menu", "/stores/owner/products"],
  ["/my/business/menu-categories", "/stores/owner/menu-categories"],
  ["/my/business/notices", "/stores/owner/notices"],
  ["/my/business/ops-status", "/stores/owner/ops-status"],
  ["/my/business/products", "/stores/owner/products"],
  ["/my/business/products/new", "/stores/owner/products/new"],
  ["/my/business/products/p-1/edit", "/stores/owner/products/p-1/edit"],
  ["/my/business/profile", "/stores/owner/profile"],
  ["/my/business/reviews", "/stores/owner/reviews"],
  ["/my/business/settings", "/stores/owner/settings"],
  ["/my/business/settlements", "/stores/owner/settlements"],
  ["/my/business/store-order-chat", "/stores/owner/order-chats"],
  ["/my/business/store-order-chat/o-1", "/stores/owner/order-chat/o-1"],
  ["/my/business/store-orders", "/stores/owner/orders"],
  ["/mypage/business", "/stores/owner"],
  ["/mypage/business/apply", "/stores/owner/apply"],
  ["/mypage/business/orders", "/stores/owner/orders"],
  ["/mypage/business/profile", "/stores/owner/profile"],
];

/** 레거시 → 캐노니컬 이동 후 다시 redirect 되는 페이지(2홉)가 되면 안 된다. */
const CANONICAL_REDIRECT_ONLY = new Set([
  "/stores/owner/menu",
  "/stores/owner/edit",
  "/stores/owner/order-chat",
]);

const QUERY = { storeId: " s1 ", tab: "history", view: "money", create: "1", ref: "x9" };

function legacyPagePath(legacy: string): string {
  const seg = legacy
    .replace("/products/p-1/edit", "/products/[productId]/edit")
    .replace("/store-order-chat/o-1", "/store-order-chat/[orderId]");
  return `app/(main)${seg}/page.tsx`;
}

describe("IA-07 legacy owner redirects — 24 URLs × query preservation", () => {
  it("table covers 24 legacy URLs and every one has a redirect page", () => {
    expect(LEGACY_TABLE).toHaveLength(24);
    for (const [legacy] of LEGACY_TABLE) {
      expect(existsSync(join(root, legacyPagePath(legacy))), legacy).toBe(true);
    }
    expect(Object.keys(LEGACY_OWNER_PATH_MAP)).toHaveLength(22);
  });

  it.each(LEGACY_TABLE)("%s → %s (1 hop)", (legacy, canonical) => {
    expect(mapLegacyOwnerPath(legacy)).toBe(canonical);
    expect(mapLegacyOwnerPath(`${legacy}/`)).toBe(canonical);
    expect(CANONICAL_REDIRECT_ONLY.has(canonical)).toBe(false);
  });

  it.each(LEGACY_TABLE)("%s preserves every search param", (legacy, canonical) => {
    const href = buildLegacyOwnerRedirectHref(legacy, QUERY);
    const url = new URL(href, "https://x.test");
    expect(url.pathname).toBe(canonical);
    expect(url.searchParams.get("storeId")).toBe("s1");
    expect(url.searchParams.get("tab")).toBe("history");
    expect(url.searchParams.get("view")).toBe("money");
    expect(url.searchParams.get("create")).toBe("1");
    expect(url.searchParams.get("ref")).toBe("x9");
  });

  it("no query → bare canonical, array params repeat, empty values dropped", () => {
    expect(buildLegacyOwnerRedirectHref("/my/business/banners", {})).toBe("/stores/owner/banners");
    expect(buildLegacyOwnerRedirectHref("/my/business/banners", null)).toBe("/stores/owner/banners");
    expect(
      buildLegacyOwnerRedirectHref("/my/business/orders-x", { storeId: "", a: ["1", "2"], b: undefined })
    ).toBe("/stores/owner/orders-x?a=1&a=2");
  });

  it("store-order-chat ?orderId= / ?order_id= → path param", () => {
    expect(buildLegacyOwnerRedirectHref("/my/business/store-order-chat", { orderId: "o 7", storeId: "s1" })).toBe(
      "/stores/owner/order-chat/o%207?storeId=s1"
    );
    expect(buildLegacyOwnerRedirectHref("/my/business/store-order-chat", { order_id: "o8" })).toBe(
      "/stores/owner/order-chat/o8"
    );
    expect(buildLegacyOwnerRedirectHref("/my/business/store-order-chat", { storeId: "s1" })).toBe(
      "/stores/owner/order-chats?storeId=s1"
    );
  });

  it("/stores/owner/edit → OwnerRoutes.profile(storeId) with query", () => {
    const src = read("app/(main)/stores/owner/edit/page.tsx");
    expect(src).toContain("OwnerRoutes.profile(storeId)");
    expect(src).toContain("appendOwnerSearchParams");
  });

  it("legacy redirect pages never drop to storeId-only builders", () => {
    for (const [legacy] of LEGACY_TABLE) {
      const src = read(legacyPagePath(legacy));
      expect(src, legacy).toMatch(/redirectLegacyOwnerPage|appendOwnerSearchParams/);
      expect(src, legacy).not.toContain("firstQueryString");
    }
  });
});

describe("IA-07 slug owner routes — 3 × query preservation", () => {
  it.each(SLUG_OWNER_SECTIONS.map((s) => [s] as const))("/stores/[slug]/owner/%s", (section) => {
    expect(buildSlugOwnerRedirectHref(section, "s1", { storeId: "other", tab: "a", x: ["1", "2"] })).toBe(
      `/stores/owner/${section}?storeId=s1&tab=a&x=1&x=2`
    );
    expect(buildSlugOwnerRedirectHref(section, null, { tab: "a" })).toBe(`/stores/owner/${section}?tab=a`);
    expect(buildSlugOwnerRedirectHref(section, "s1", null)).toBe(`/stores/owner/${section}?storeId=s1`);
    const src = read(`app/(main)/stores/[slug]/owner/${section}/page.tsx`);
    expect(src).toContain(`redirectSlugOwnerPage("${section}"`);
    expect(src).not.toContain("OwnerSubpageDetailHeader");
  });
});

describe("IA-08 shell storeId normalization (2-store fixture)", () => {
  const stores = [
    { id: "store-a", approval_status: "approved", is_visible: true, sales_permission: true },
    { id: "store-b", approval_status: "approved", is_visible: true, sales_permission: true },
  ];

  it("URL without storeId → replace with shell-selected store (session preferred), query/hash kept", () => {
    const selected = resolveOwnerActiveStoreRow(stores, { routeStoreId: "", preferredStoreId: "store-b" });
    expect(selected?.id).toBe("store-b");
    expect(
      buildOwnerStoreIdNormalizedHref({
        pathname: "/stores/owner/coupons",
        search: "?create=1",
        hash: "#top",
        selectedStoreId: selected?.id,
      })
    ).toBe("/stores/owner/coupons?storeId=store-b&create=1#top");
  });

  it("URL with storeId → no normalization; shell honours owned route store", () => {
    const selected = resolveOwnerActiveStoreRow(stores, { routeStoreId: "store-a", preferredStoreId: "store-b" });
    expect(selected?.id).toBe("store-a");
    expect(
      buildOwnerStoreIdNormalizedHref({
        pathname: "/stores/owner/coupons",
        search: "?storeId=store-a",
        selectedStoreId: selected?.id,
      })
    ).toBeNull();
  });

  it("single-store owner normalizes to the same store; no store / non-shell paths → null", () => {
    const one = resolveOwnerActiveStoreRow([stores[0]!], { routeStoreId: "" });
    expect(
      buildOwnerStoreIdNormalizedHref({ pathname: "/stores/owner", search: "", selectedStoreId: one?.id })
    ).toBe("/stores/owner?storeId=store-a");
    expect(buildOwnerStoreIdNormalizedHref({ pathname: "/stores/owner", search: "", selectedStoreId: null })).toBeNull();
    expect(isOwnerStoreIdNormalizablePath("/stores/owner/apply")).toBe(false);
    expect(isOwnerStoreIdNormalizablePath("/stores/owner/order-chat/o1")).toBe(false);
    expect(isOwnerStoreIdNormalizablePath("/stores/demo")).toBe(false);
  });

  it("shell normalizes once; stores[0] removed from event-promotions & notifications", () => {
    const shell = read("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).toContain("buildOwnerStoreIdNormalizedHref");
    expect(shell).toContain("router.replace(href, { scroll: false })");
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const promo = strip(read("app/(main)/stores/owner/ads/event-promotions/page.tsx"));
    const notif = strip(read("components/business/owner/OwnerStoreNotificationsView.tsx"));
    for (const src of [promo, notif]) {
      expect(src).not.toMatch(/stores\?\.\[0\]|list\[0\]/);
      expect(src).toContain("useBusinessAdminStore");
    }
  });

  it("ads hub apply links carry storeId; event promotions has an entry point", () => {
    const hub = read("components/business/owner/ads/OwnerDeliveryAdsHubView.tsx");
    expect(hub).toContain("withStoreId(DELIVERY_AD_OWNER_ROUTES.createStoreSponsored, activeStoreId || null)");
    expect(hub).toContain("withStoreId(DELIVERY_AD_OWNER_ROUTES.createBanner, activeStoreId || null)");
    expect(hub).toContain("withStoreId(PLATFORM_POPUP_OWNER_ROUTES.createPlatformPopup, activeStoreId || null)");
    expect(hub).toContain("OwnerRoutes.adsEventPromotions(");
    expect(OwnerRoutes.adsEventPromotions("s1")).toBe("/stores/owner/ads/event-promotions?storeId=s1");
  });
});

describe("IA-12 duplicate entry points", () => {
  it("finance ?section=orders → transactions; orders tab removed", () => {
    expect(normalizeOwnerFinanceSection("orders")).toBe("transactions");
    expect(normalizeOwnerFinanceSection(null)).toBe("transactions");
    expect(normalizeOwnerFinanceSection(" coin ")).toBe("coin");
    const nav = read("components/finance/OwnerFinanceNav.tsx");
    expect(nav).not.toContain('section: "orders"');
    expect(read("components/business/owner/OwnerStoreFinanceView.tsx")).not.toContain('section === "orders"');
  });

  it("CS list URLs server-redirect to customer center (1 hop, query kept)", () => {
    expect(buildOwnerCareCenterRedirectHref("messages", { storeId: "s1", q: "a" })).toBe(
      "/stores/owner/customer-care/customer-center?storeId=s1&tab=messages&q=a&from=owner-care"
    );
    expect(buildOwnerCareCenterRedirectHref("inquiries", { from: "push" })).toBe(
      "/stores/owner/customer-care/customer-center?tab=inquiries&from=push"
    );
    for (const tab of ["messages", "inquiries"]) {
      const src = read(`app/(main)/stores/owner/customer-care/${tab}/page.tsx`);
      expect(src).not.toContain('"use client"');
      expect(src).toContain(`buildOwnerCareCenterRedirectHref("${tab}"`);
    }
    expect("customerCareInquiries" in OwnerRoutes).toBe(false);
  });

  it("visibility/open toggles only on /settings; header & ops-status show chip + link", () => {
    const shell = read("components/business/admin/BusinessAdminShell.tsx");
    expect(shell).not.toContain("<BusinessAdminVisibleToggle");
    expect(shell).not.toContain("<BusinessAdminOpenToggle");
    expect(shell).toContain('t("owner_stage4_change_in_store_manage")');
    const ops = read("components/business/owner/OwnerStoreOpsStatusBody.tsx");
    expect(ops).toContain('data-owner-ops-status-settings-link="1"');
    expect(ops).toContain("OwnerRoutes.settings(sid)");
    const settings = read("components/business/owner/OwnerStoreSettingsContent.tsx");
    expect(settings).toContain("<BusinessAdminVisibleToggle");
    expect(settings).not.toContain('className="sr-only"');
  });
});

describe("IA-13 settlement wording (owner UI)", () => {
  it("no per-order settlement / payout wording in owner UI", () => {
    const files = [
      "components/finance/OwnerFinanceNav.tsx",
      "components/business/owner/OwnerStoreFinanceView.tsx",
      "components/business/owner/OwnerStoreSettlementsView.tsx",
      "lib/i18n/catalog/business-admin-nav.ts",
      "lib/i18n/catalog/owner-stage4-routes.ts",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toContain("주문별 정산");
      expect(src, f).not.toContain("지급 현황");
    }
    expect(read("lib/i18n/catalog/business-admin-nav.ts")).toContain(
      'biz_nav_settlements_desc: "수수료 부과·캐시 차감·미납 원장"'
    );
    expect(read("components/finance/OwnerFinanceNav.tsx")).toContain('labelKo: "Coin 환전"');
    expect(read("components/business/owner/OwnerStoreSettlementsView.tsx")).toContain('"수수료·캐시 원장"');
  });

  it("new catalog ko/en parity", () => {
    expect(Object.keys(ownerStage4RoutesMessages.en).sort()).toEqual(
      Object.keys(ownerStage4RoutesMessages.ko).sort()
    );
  });
});

describe("IA-18 orphan components removed (D-12)", () => {
  it.each([
    "components/business/admin/dashboard/BusinessDashboardOwnerCardMenu.tsx",
    "components/business/admin/dashboard/BusinessDashboardQuickRow.tsx",
    "components/business/admin/dashboard/BusinessDashboardInsights.tsx",
    "components/business/admin/dashboard/BusinessDashboardPriorityCards.tsx",
    "components/business/admin/dashboard/BusinessDashboardKpiStrip.tsx",
    "components/business/admin/dashboard/BusinessDashboardMobileBar.tsx",
    "components/business/BusinessProductList.tsx",
    "components/business/MyStoreSettlementsPage.tsx",
    "components/business/BusinessProfileEditForm.tsx",
    "components/business/BusinessProfileView.tsx",
    "components/business/owner/OwnerStoreOrderDetailPanel.tsx",
    "components/business/owner/OwnerStoreOrderCardFooterActions.tsx",
    "components/business/owner/OwnerOrderStatusTimeline.tsx",
    "components/business/owner/OwnerStoreOrderModalSellerToolbar.tsx",
    "components/business/owner/OwnerProductNewStoreIdRedirect.tsx",
    "components/business/owner/OwnerStoreOrdersPageFallback.tsx",
    "components/business/owner/ads/OwnerDeliveryAdApplicationWizardShell.tsx",
    "components/stores/owner/dashboard/OwnerQuickActions.tsx",
  ])("%s deleted", (rel) => {
    expect(existsSync(join(root, rel))).toBe(false);
  });

  it("orphan routes kept as URLs", () => {
    for (const rel of [
      "app/(main)/stores/owner/ads/event-promotions/page.tsx",
      "app/(main)/stores/[slug]/owner/notifications/page.tsx",
      "app/(main)/stores/[slug]/owner/notification-settings/page.tsx",
    ]) {
      expect(existsSync(join(root, rel)), rel).toBe(true);
    }
  });
});
