/**
 * 4단계 4-1 (IA-09·10·11·21) — 12그룹 레지스트리 파생 계약.
 * 문서 G §4-5 오너 화면 44행 → 제목 존재·드로어 라벨 일치·활성 항목·뒤로가기 부모,
 * 상태 × 항목 노출 매트릭스 = 1-B 게이트(서버 `owner-product-gate` · `StoreBusinessGuard`) 매트릭스.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OWNER_NAV_GROUPS,
  OWNER_NAV_REGISTRY,
  buildOwnerDrawerSectionsFromRegistry,
  isOwnerPathAllowedForApprovalStatus,
  ownerNavEntryVisible,
  resolveOwnerNavActiveIds,
  resolveOwnerNavBottomTab,
  resolveOwnerNavMatch,
  type OwnerNavEntryDef,
} from "@/lib/business/owner-nav-registry";
import type { BusinessAdminNavItemId } from "@/lib/business/business-admin-nav-ids";
import { getBusinessAdminPageTitleI18n } from "@/lib/business/business-admin-page-title-i18n";
import {
  applyOwnerNavParentLastQuery,
  rememberOwnerNavLastQuery,
  resolveOwnerStackBackHref,
} from "@/lib/business/owner-stack-back-href";
import { translate } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  ownerStoreOperationalWriteBlock,
  ownerStoreProfileWriteBlock,
} from "@/lib/stores/owner-product-gate";
import type { MyBusinessNavContext } from "@/lib/business/my-business-nav-types";

const SID = "s1";

/** [문서 G §4-5 행, URL, 활성 항목, 뒤로가기 href(undefined = 허브 자신)] */
const CANONICAL_ROWS: ReadonlyArray<
  readonly [number, string, BusinessAdminNavItemId, string | undefined]
> = [
  [1, "/stores/owner", "dashboard", undefined],
  [2, "/stores/owner/apply", "apply", "/stores/owner?storeId=s1"],
  [3, "/stores/owner/orders", "delivery_orders", "/stores/owner?storeId=s1"],
  [4, "/stores/owner/order-chats", "order_chats", "/stores/owner/orders?storeId=s1"],
  [5, "/stores/owner/order-chat/o1", "order_chats", "/stores/owner/order-chats?storeId=s1"],
  [6, "/stores/owner/products", "products", "/stores/owner?storeId=s1"],
  [7, "/stores/owner/products/new", "product_new", "/stores/owner/products?storeId=s1"],
  [8, "/stores/owner/products/p1/edit", "product_edit", "/stores/owner/products?storeId=s1"],
  [9, "/stores/owner/menu", "products", "/stores/owner?storeId=s1"],
  [10, "/stores/owner/menu-categories", "categories", "/stores/owner/products?storeId=s1"],
  [11, "/stores/owner/settings", "store_manage", "/stores/owner?storeId=s1"],
  [12, "/stores/owner/ops-status", "delivery_ops", "/stores/owner/settings?storeId=s1"],
  [13, "/stores/owner/basic-info", "basic_info", "/stores/owner/settings?storeId=s1"],
  [14, "/stores/owner/profile", "store_settings", "/stores/owner/settings?storeId=s1"],
  [15, "/stores/owner/profile#delivery", "store_settings", "/stores/owner/settings?storeId=s1"],
  [16, "/stores/owner/edit", "store_settings", "/stores/owner/settings?storeId=s1"],
  [17, "/stores/owner/settlements", "settlements", "/stores/owner?storeId=s1"],
  [18, "/stores/owner/finance?section=transactions", "settlements", "/stores/owner?storeId=s1"],
  [18, "/stores/owner/finance?section=outstanding", "settlements", "/stores/owner?storeId=s1"],
  [19, "/stores/owner/finance?section=coin", "finance", "/stores/owner?storeId=s1"],
  [19, "/stores/owner/finance?section=withdraw", "finance", "/stores/owner?storeId=s1"],
  [19, "/stores/owner/finance", "finance", "/stores/owner?storeId=s1"],
  [20, "/stores/owner/business-cash", "finance", "/stores/owner?storeId=s1"],
  [20, "/stores/owner/points", "finance", "/stores/owner?storeId=s1"],
  [21, "/stores/owner/ads", "ads", "/stores/owner?storeId=s1"],
  [22, "/stores/owner/ads/new/store-sponsored", "ads", "/stores/owner/ads?storeId=s1"],
  [23, "/stores/owner/ads/new/banner", "ads", "/stores/owner/ads?storeId=s1"],
  [24, "/stores/owner/ads/new/platform-popup", "ads", "/stores/owner/ads?storeId=s1"],
  [25, "/stores/owner/ads/c1", "ads", "/stores/owner/ads?storeId=s1"],
  [26, "/stores/owner/ads/partner", "ads", "/stores/owner/ads?storeId=s1"],
  [27, "/stores/owner/ads/popup/r1", "ads", "/stores/owner/ads?storeId=s1"],
  [28, "/stores/owner/ads/event-promotions", "ads_event", "/stores/owner/ads?storeId=s1"],
  [
    29,
    "/stores/owner/ads/event-promotions/r1",
    "ads_event",
    "/stores/owner/ads/event-promotions?storeId=s1",
  ],
  [30, "/stores/owner/coupons?create=1", "coupons", "/stores/owner/ads?storeId=s1"],
  [31, "/stores/owner/banners", "banners", "/stores/owner/ads?storeId=s1"],
  [32, "/stores/owner/notices", "notices", "/stores/owner/ads?storeId=s1"],
  [33, "/stores/owner/gift-certificates?view=money", "gift_certificates", "/stores/owner?storeId=s1"],
  [34, "/stores/owner/customer-care", "customer_care", "/stores/owner?storeId=s1"],
  [35, "/stores/owner/inquiries", "inquiries", "/stores/owner/customer-care?storeId=s1"],
  [36, "/stores/owner/reviews", "reviews", "/stores/owner/customer-care?storeId=s1"],
  [37, "/stores/owner/notifications", "notifications", "/stores/owner?storeId=s1"],
  [
    38,
    "/stores/owner/notification-settings",
    "notification_settings",
    "/stores/owner/notifications?storeId=s1",
  ],
  [39, "/stores/owner/customer-care/customer-center", "customer_center", "/stores/owner?storeId=s1"],
  [40, "/stores/owner/customer-care/messages", "customer_center", "/stores/owner?storeId=s1"],
  [40, "/stores/owner/customer-care/inquiries", "customer_center", "/stores/owner?storeId=s1"],
  [
    41,
    "/stores/owner/customer-care/messages/t1",
    "customer_center",
    "/stores/owner/customer-care/customer-center?storeId=s1&from=owner-care",
  ],
  [
    41,
    "/stores/owner/customer-care/inquiries/t1",
    "customer_center",
    "/stores/owner/customer-care/customer-center?storeId=s1&from=owner-care",
  ],
  [42, "/stores/my-shop/owner/notifications", "notifications", "/stores/owner?storeId=s1"],
  [
    42,
    "/stores/my-shop/owner/notification-settings",
    "notification_settings",
    "/stores/owner/notifications?storeId=s1",
  ],
  [43, "/stores/my-shop/owner/orders", "delivery_orders", "/stores/owner?storeId=s1"],
  [44, "/my/business/products", "products", "/stores/owner?storeId=s1"],
  [44, "/my/business/store-order-chat/o1", "order_chats", "/stores/owner/order-chats?storeId=s1"],
  [44, "/mypage/business/orders", "delivery_orders", "/stores/owner?storeId=s1"],
  [44, "/mypage/business/settlements", "settlements", "/stores/owner?storeId=s1"],
];

function entryOf(id: BusinessAdminNavItemId): OwnerNavEntryDef {
  const e = OWNER_NAV_REGISTRY.find((x) => x.id === id);
  if (!e) throw new Error(`missing registry entry ${id}`);
  return e;
}

function ctx(approvalStatus: string): MyBusinessNavContext {
  return {
    storeId: SID,
    slug: "my-shop",
    approvalStatus,
    isVisible: true,
    canSell: true,
    orderAlertsBadge: 0,
  };
}

function splitUrl(url: string): [string, string] {
  const [path = "", q = ""] = url.split("?");
  return [path, q];
}

describe("4-2 레지스트리 데이터 — 12그룹 · 필드", () => {
  it("12 groups in design order, every entry belongs to one", () => {
    expect(OWNER_NAV_GROUPS.map((g) => g.id)).toEqual([
      "home",
      "orders",
      "products",
      "store",
      "delivery",
      "settlement",
      "coin_cash",
      "ads",
      "gift",
      "customers",
      "notifications",
      "support",
    ]);
    const groupIds = new Set(OWNER_NAV_GROUPS.map((g) => g.id));
    for (const e of OWNER_NAV_REGISTRY) expect(groupIds.has(e.group)).toBe(true);
  });

  it("parentId always points to an existing entry (no cycles)", () => {
    for (const e of OWNER_NAV_REGISTRY) {
      const seen = new Set<string>([e.id]);
      let p = e.parentId;
      while (p) {
        expect(seen.has(p)).toBe(false);
        seen.add(p);
        p = entryOf(p).parentId;
      }
    }
  });

  it("every titleKey resolves in ko and en (rule 5 — no unregistered titles)", () => {
    for (const e of OWNER_NAV_REGISTRY) {
      for (const lang of ["ko", "en"] as const) {
        const v = translate(lang, e.titleKey);
        expect(v.trim().length).toBeGreaterThan(0);
        expect(v).not.toBe(e.titleKey);
      }
    }
  });

  it("D-13 labels — settlements 「수수료·캐시 원장」, typo 「상품 관리 , 등록」 removed", () => {
    expect(translate("ko", entryOf("settlements").titleKey)).toBe("수수료·캐시 원장");
    expect(translate("ko", "biz_title_products")).toBe("상품 관리");
    expect(translate("ko", entryOf("products").titleKey)).toBe("상품 관리");
  });
});

describe("§4-5 44행 경로 표 — 제목·드로어 라벨·활성·뒤로가기", () => {
  const approvedDrawer = buildOwnerDrawerSectionsFromRegistry(ctx("approved")).flatMap((s) => s.items);
  const lang = getRuntimeAppLanguage();

  it("covers all 44 rows", () => {
    expect(new Set(CANONICAL_ROWS.map((r) => r[0])).size).toBe(44);
  });

  it.each(CANONICAL_ROWS)("row %i %s → %s", (_row, url, id, back) => {
    const [path, q] = splitUrl(url);
    const match = resolveOwnerNavMatch(path, q);
    expect(match?.entry.id).toBe(id);
    const entry = entryOf(id);

    // 제목: 레지스트리 titleKey 와 헤더 함수가 같다 (허브는 매장명 헤더라 null)
    const title = getBusinessAdminPageTitleI18n(path, q);
    if (id === "dashboard") expect(title).toBeNull();
    else expect(title).toBe(translate(lang, entry.titleKey).toLocaleUpperCase());

    // 드로어 라벨 = 제목 (드로어 노출 항목)
    const drawerItem = approvedDrawer.find((i) => i.id === id);
    if (entry.surfaces.includes("drawer")) {
      expect(drawerItem?.labelKey).toBe(entry.titleKey);
    } else {
      expect(drawerItem).toBeUndefined();
    }

    // 활성: 일치 항목 + 조상(허브 제외)
    const active = resolveOwnerNavActiveIds(path, q);
    expect(active.has(id)).toBe(true);
    let p = entry.parentId;
    while (p && p !== "dashboard") {
      expect(active.has(p)).toBe(true);
      p = entryOf(p).parentId;
    }
    if (id !== "dashboard") expect(active.has("dashboard")).toBe(false);

    // 하단탭 = 항목 bottomTab
    expect(resolveOwnerNavBottomTab(path, q)).toBe(entry.bottomTab);

    // 뒤로가기 = parentId(하위 화면이면 그 항목) + storeId 보존
    expect(resolveOwnerStackBackHref(path, SID, q)).toBe(back);
  });

  it("unregistered owner path → default title, hub back", () => {
    expect(resolveOwnerNavMatch("/stores/owner/unknown-page")).toBeNull();
    expect(getBusinessAdminPageTitleI18n("/stores/owner/unknown-page")).toBe(
      translate(lang, "biz_title_default").toLocaleUpperCase()
    );
    expect(resolveOwnerStackBackHref("/stores/owner/unknown-page", SID)).toBe(
      "/stores/owner?storeId=s1"
    );
  });
});

describe("IA-11 — 부모 화면 마지막 쿼리 보존 (sessionStorage, try/catch)", () => {
  const g = globalThis as unknown as { window?: unknown };
  const originalWindow = g.window;
  afterEach(() => {
    if (originalWindow === undefined) delete g.window;
    else g.window = originalWindow;
  });

  function installStorage(throwing = false) {
    const map = new Map<string, string>();
    g.window = {
      sessionStorage: {
        getItem: (k: string) => {
          if (throwing) throw new Error("blocked");
          return map.get(k) ?? null;
        },
        setItem: (k: string, v: string) => {
          if (throwing) throw new Error("blocked");
          map.set(k, v);
        },
        removeItem: (k: string) => {
          map.delete(k);
        },
      },
    };
  }

  it("orders filter survives order-chats → back", () => {
    installStorage();
    rememberOwnerNavLastQuery("/stores/owner/orders", "storeId=s1&tab=done&q=abc");
    const base = resolveOwnerStackBackHref("/stores/owner/order-chats", SID);
    expect(base).toBe("/stores/owner/orders?storeId=s1");
    const href = applyOwnerNavParentLastQuery(base!);
    const u = new URL(href, "https://x.test");
    expect(u.pathname).toBe("/stores/owner/orders");
    expect(u.searchParams.get("storeId")).toBe("s1");
    expect(u.searchParams.get("tab")).toBe("done");
    expect(u.searchParams.get("q")).toBe("abc");
  });

  it("saved storeId never overrides the current store", () => {
    installStorage();
    rememberOwnerNavLastQuery("/stores/owner/ads", "storeId=OTHER&status=live");
    const href = applyOwnerNavParentLastQuery(resolveOwnerStackBackHref("/stores/owner/coupons", SID)!);
    const u = new URL(href, "https://x.test");
    expect(u.searchParams.get("storeId")).toBe("s1");
    expect(u.searchParams.get("status")).toBe("live");
  });

  it("storage failure → href unchanged (no throw)", () => {
    installStorage(true);
    expect(() => rememberOwnerNavLastQuery("/stores/owner/orders", "tab=done")).not.toThrow();
    expect(applyOwnerNavParentLastQuery("/stores/owner/orders?storeId=s1")).toBe(
      "/stores/owner/orders?storeId=s1"
    );
  });
});

describe("IA-21 — 상태 × 항목 노출 매트릭스 = 1-B 게이트 매트릭스", () => {
  const STATUSES = ["pending", "revision_requested", "approved", "suspended"] as const;
  const drawerEntries = OWNER_NAV_REGISTRY.filter((e) => e.surfaces.includes("drawer"));

  /** 문서 G §4-2 access 열 → 상태별 기대 노출 (DEF-71 · D-16) */
  const EXPECTED_VISIBLE: Record<(typeof STATUSES)[number], BusinessAdminNavItemId[]> = {
    pending: [
      "dashboard",
      "delivery_ops",
      "basic_info",
      "store_settings",
      "notifications",
      "notification_settings",
      "customer_center",
    ],
    revision_requested: [
      "dashboard",
      "delivery_ops",
      "basic_info",
      "store_settings",
      "notifications",
      "notification_settings",
      "customer_center",
    ],
    approved: drawerEntries.map((e) => e.id),
    suspended: [
      "dashboard",
      "delivery_orders",
      "order_chats",
      "settlements",
      "notifications",
      "notification_settings",
      "customer_center",
    ],
  };

  function serverGateAllows(entry: OwnerNavEntryDef, status: string): boolean {
    switch (entry.access) {
      case "any":
        return true;
      case "approved":
        return ownerStoreOperationalWriteBlock(status) === null;
      case "preApproval":
        return ownerStoreProfileWriteBlock(status) === null;
      case "suspendedAllowed":
        return ownerStoreOperationalWriteBlock(status) === null || status === "suspended";
    }
  }

  it.each(STATUSES)("%s — drawer items match expected matrix", (status) => {
    const visible = buildOwnerDrawerSectionsFromRegistry(ctx(status))
      .flatMap((s) => s.items)
      .map((i) => i.id);
    expect([...visible].sort()).toEqual([...EXPECTED_VISIBLE[status]].sort());
  });

  it.each(STATUSES)("%s — visible ⇔ server gate ⇔ StoreBusinessGuard path gate", (status) => {
    for (const entry of drawerEntries) {
      const visible = ownerNavEntryVisible(entry, ctx(status));
      expect(visible, `${status}/${entry.id} server`).toBe(serverGateAllows(entry, status));
      if (entry.id === "public_store") continue; // 미리보기 모달 — 경로 없음
      const [path, q] = splitUrl(entry.href(SID, "my-shop"));
      expect(
        isOwnerPathAllowedForApprovalStatus(path, status, q),
        `${status}/${entry.id} guard`
      ).toBe(visible);
    }
  });

  it("ads (formerly no approval check) is now hidden for non-approved stores", () => {
    expect(ownerNavEntryVisible(entryOf("ads"), ctx("pending"))).toBe(false);
    expect(isOwnerPathAllowedForApprovalStatus("/stores/owner/ads", "pending")).toBe(false);
  });

  it("onboarding routes stay open for pending (IA-01 preserved)", () => {
    for (const p of ["/stores/owner/apply", "/stores/owner/profile", "/stores/owner/basic-info"]) {
      expect(isOwnerPathAllowedForApprovalStatus(p, "pending")).toBe(true);
      expect(isOwnerPathAllowedForApprovalStatus(p, "revision_requested")).toBe(true);
    }
    expect(isOwnerPathAllowedForApprovalStatus("/stores/owner/orders", "pending")).toBe(false);
    expect(isOwnerPathAllowedForApprovalStatus("/stores/owner/orders", "suspended")).toBe(true);
    expect(isOwnerPathAllowedForApprovalStatus("/stores/owner/order-chat/o1", "suspended")).toBe(
      true
    );
    expect(isOwnerPathAllowedForApprovalStatus("/stores/owner/products", "suspended")).toBe(false);
  });
});

describe("4-7 (IA-20 · D-11) — ≥1280px 고정 사이드바 · 폰 레이아웃 불변", () => {
  const css = readFileSync(join(process.cwd(), "app/owner-compact-shell.css"), "utf8");
  const shell = readFileSync(
    join(process.cwd(), "components/business/admin/BusinessAdminShell.tsx"),
    "utf8"
  );

  it("sidebar is not force-hidden; shown only at ≥1280px with bottom tab hidden there", () => {
    expect(css).not.toMatch(/\.owner-ops-desktop-sidebar\s*\{\s*display:\s*none\s*!important/);
    const at = css.indexOf("@media (min-width: 1280px)");
    expect(at).toBeGreaterThan(0);
    const media = css.slice(at);
    expect(media).toMatch(/\.owner-ops-desktop-sidebar\s*\{[^}]*display:\s*flex/);
    expect(media).toMatch(
      /\.owner-mobile-bottom-nav\.app-bottom-nav-shell--delivery\s*\{\s*display:\s*none/
    );
    // 1280 미만: 기본 숨김 + 하단 5탭 기본 표시 규칙 유지
    expect(css).toMatch(/\.owner-ops-desktop-sidebar\s*\{\s*display:\s*none;\s*\}/);
    expect(css).toMatch(
      /\.owner-mobile-bottom-nav\.app-bottom-nav-shell--delivery\s*\{\s*display:\s*flex;/
    );
  });

  it("shell renders the sidebar from the same registry sections (collapsible)", () => {
    expect(shell).toContain('className="owner-ops-desktop-sidebar"');
    expect(shell).toMatch(/<BusinessAdminSidebar sections=\{sections\}[^>]*collapsible/);
  });
});
