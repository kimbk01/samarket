/**
 * 5-F 「배달 화면 구성」 허브 — 라우트·접근표·재사용·리다이렉트 계약.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAdminRouteAccess } from "@/lib/admin/access/admin-route-access";
import { ADMIN_UI_STANDARD_SCREENS } from "@/lib/admin/ui-standard/admin-ui-standard-screens";
import { DELIVERY_SCREENS_TABS } from "@/components/admin/stores/delivery-screens/delivery-screens-status";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("5-F 배달 화면 구성 허브", () => {
  it("라우트 · 접근표 · UI 표준 화면 등록", () => {
    expect(existsSync(path.join(process.cwd(), "app/admin/delivery-screens/page.tsx"))).toBe(true);
    const access = resolveAdminRouteAccess("/admin/delivery-screens?tab=browse");
    expect(access.matched).toBe(true);
    expect(access.requirement).toEqual({ kind: "any_admin" });
    expect(ADMIN_UI_STANDARD_SCREENS.delivery).toContain("/admin/delivery-screens");
  });

  it("탭 4개 = 홈 화면 · 메뉴 구성 · 업종 목록 화면 · 업종 분류 (주소 ?tab=)", () => {
    /** 재감사 F5 — 메뉴 구성(menus)을 업종 목록 화면(browse)과 분리 */
    expect(DELIVERY_SCREENS_TABS.map((t) => t.id)).toEqual(["home", "menus", "browse", "taxonomy"]);
    const hub = read("components/admin/stores/delivery-screens/AdminDeliveryScreensHub.tsx");
    expect(hub).toContain('defaultValue="home"');
    expect(hub).not.toContain("syncUrl={false}");
  });

  it("기존 편집기·패널·업종 관리 컴포넌트를 재사용 (새 저장 API 없음)", () => {
    const home = read("components/admin/stores/delivery-screens/DeliveryScreensHomeTab.tsx");
    expect(home).toContain("AdminStoresHomeShelvesEditor");
    expect(home).toContain("AdminDeliveryAdHomePolicyPanel");
    expect(home).toContain("DELIVERY_AD_ADMIN_ROUTES.firstPartyNew");
    const browse = read("components/admin/stores/delivery-screens/DeliveryScreensBrowseTab.tsx");
    expect(browse).toContain("AdminStoresCategoryPolicyEditor");
    const taxonomy = read("components/admin/stores/delivery-screens/DeliveryScreensTaxonomyTab.tsx");
    expect(taxonomy).toContain("AdminStoreTaxonomyManager");
    for (const f of [home, browse, taxonomy]) {
      expect(f).not.toMatch(/method:\s*"(PUT|POST|PATCH|DELETE)"/);
    }
    /** 기존 화면도 같은 편집기로 계속 동작 */
    expect(read("components/admin/stores/AdminStoresHomeShelvesPage.tsx")).toContain("<AdminStoresHomeShelvesEditor />");
    expect(read("components/admin/stores/AdminStoresCategoryPolicyPage.tsx")).toContain("<AdminStoresCategoryPolicyEditor />");
    /** 업종 정책 편집기는 현재 경로에 쿼리를 쓴다 (허브 tab 보존) */
    expect(read("components/admin/stores/AdminStoresCategoryPolicyPage.tsx")).toContain("router.replace(`${pathname}");
  });

  it("/admin/advertising/direct/delivery → /admin/delivery-ads/first-party/new 리다이렉트", () => {
    const page = read("app/admin/advertising/direct/delivery/page.tsx");
    expect(page).toContain("redirect(DELIVERY_AD_ADMIN_ROUTES.firstPartyNew)");
    expect(page).not.toContain("AdminAdsDirectDeliveryCreateView");
  });
});
