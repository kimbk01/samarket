import { describe, expect, it, vi } from "vitest";
import {
  isOwnerHomeHubBottomNavActive,
  resolveOwnerHomeStoreHref,
  runOwnerHomeStoreNavigation,
} from "@/lib/delivery/owner/owner-home-hub-navigation";

describe("owner home → 배달 매장 (Owner S-B 2026-11-03)", () => {
  it("detects owner dashboard as home hub active", () => {
    expect(isOwnerHomeHubBottomNavActive("/stores/owner")).toBe(true);
    expect(isOwnerHomeHubBottomNavActive("/stores/owner/orders")).toBe(false);
  });

  it("홈 목적지 = 해당 오너의 배달 매장 /stores/{slug} · slug 없으면 null", () => {
    expect(resolveOwnerHomeStoreHref("my-shop")).toBe("/stores/my-shop");
    expect(resolveOwnerHomeStoreHref(" 가게 ")).toBe(`/stores/${encodeURIComponent("가게")}`);
    expect(resolveOwnerHomeStoreHref("")).toBeNull();
    expect(resolveOwnerHomeStoreHref(null)).toBeNull();
  });

  it("확인 시 가드 통과하면 1회 push, 막히면 이동 없음", () => {
    const push = vi.fn();
    expect(runOwnerHomeStoreNavigation({ href: "/stores/my-shop", guardBeforeNavigate: () => true, push })).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/stores/my-shop");
    const blocked = vi.fn();
    expect(runOwnerHomeStoreNavigation({ href: "/stores/my-shop", guardBeforeNavigate: () => false, push: blocked })).toBe(false);
    expect(blocked).not.toHaveBeenCalled();
  });

  it("사장님 하단 탭은 다이얼(FAB)을 쓰지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/stores/owner/OwnerMobileBottomNav.tsx", "utf8");
    expect(src).not.toContain("DeliveryDomainSwitcherOverlay");
    expect(src).toContain("popup_owner_home_go_store_title");
  });
});
