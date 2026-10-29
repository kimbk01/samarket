import { describe, expect, it } from "vitest";
import {
  adminMenu,
  filterMenuForPublicSidebar,
  type AdminMenuItem,
} from "@/components/admin/admin-menu";
import {
  collectMenuPathEntries,
  isLeafMenuActive,
} from "@/components/admin/sidebar/admin-sidebar-active-path";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { resolveActiveWorkspace } from "@/lib/admin/admin-workspace-routing";

function walkLeaves(items: AdminMenuItem[], out: AdminMenuItem[] = []): AdminMenuItem[] {
  for (const item of items) {
    if (item.children?.length) walkLeaves(item.children, out);
    else out.push(item);
  }
  return out;
}

function activeLeafKeys(route: string): string[] {
  const ws = resolveActiveWorkspace(route, "master");
  const children = ws.item.children?.length ? ws.item.children : [ws.item];
  const scope = collectMenuPathEntries(children);
  return walkLeaves(children)
    .filter((leaf) =>
      isLeafMenuActive(leaf.path, route, scope, leaf.matchPaths, {
        exactPath: leaf.exactPath === true,
        matchPathPrefixes: leaf.matchPathPrefixes,
      })
    )
    .map((leaf) => leaf.key);
}

describe("5-G 배달 메뉴 목적별 재편", () => {
  it("화면 구성 그룹 첫 메뉴 = 배달 화면 구성 허브, 흡수된 화면은 사이드바에서만 숨김", () => {
    const section = findAdminMenuByKey(adminMenu, "delivery-section-home-layout");
    expect(section?.children?.[0]?.key).toBe("delivery-screens");
    expect(section?.children?.[0]?.path).toBe("/admin/delivery-screens");
    for (const k of ["stores-home-shelves", "stores-industries-management", "stores-browse-policy"]) {
      expect(findAdminMenuByKey(adminMenu, k)?.sidebarPublic).toBe(false);
    }
    const publicDelivery = filterMenuForPublicSidebar(adminMenu).find((w) => w.key === "delivery");
    const publicKeys = walkLeaves(publicDelivery?.children ?? []).map((l) => l.key);
    expect(publicKeys).toContain("delivery-screens");
    expect(publicKeys).not.toContain("stores-home-shelves");
    expect(publicKeys).not.toContain("stores-browse-policy");
  });

  it("옛 화면 주소에서도 허브 메뉴가 강조된다", () => {
    for (const route of [
      "/admin/delivery-screens?tab=home",
      "/admin/stores-home-shelves",
      "/admin/stores-category-policy?primary=restaurant",
    ]) {
      expect(activeLeafKeys(route), route).toContain("delivery-screens");
    }
  });

  it("결제 수신 기록은 「기록」 그룹, 설정 그룹은 마지막 유지", () => {
    const delivery = findAdminMenuByKey(adminMenu, "delivery");
    const top = (delivery?.children ?? []).map((c) => c.key);
    expect(top.at(-1)).toBe("delivery-section-settings");
    expect(top.at(-2)).toBe("delivery-section-records");
    const records = findAdminMenuByKey(adminMenu, "delivery-section-records");
    expect((records?.children ?? []).map((c) => c.key)).toEqual(["store-payment-events-admin"]);
  });

  it("배달 광고 화면은 CUT J 하드락대로 광고 작업 공간에 남는다", () => {
    const delivery = findAdminMenuByKey(adminMenu, "delivery");
    const keys = walkLeaves(delivery?.children ?? []).map((l) => l.key);
    expect(keys).not.toContain("delivery-ads-ops");
    expect(resolveActiveWorkspace("/admin/delivery-ads/manage", "master").id).toBe("ads");
  });
});
