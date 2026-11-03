import { describe, expect, it, vi } from "vitest";
import {
  isOwnerHomeHubBottomNavActive,
  resolveOwnerHomeStoreTarget,
  runOwnerHomeStoreNavigation,
} from "@/lib/delivery/owner/owner-home-hub-navigation";

describe("owner home → 배달 매장 (Owner S-B 2026-11-03)", () => {
  it("detects owner dashboard as home hub active", () => {
    expect(isOwnerHomeHubBottomNavActive("/stores/owner")).toBe(true);
    expect(isOwnerHomeHubBottomNavActive("/stores/owner/orders")).toBe(false);
  });

  it("홈 목적지 = 승인 매장이면 /stores/{slug} (숨김 매장도 — 사장님 본인에게는 열림) · 미승인·slug 없음만 안내", () => {
    const ok = { approvalStatus: "approved" };
    expect(resolveOwnerHomeStoreTarget({ ...ok, slug: "my-shop" })).toEqual({ kind: "store", href: "/stores/my-shop" });
    expect(resolveOwnerHomeStoreTarget({ ...ok, slug: " 가게 " })).toEqual({
      kind: "store",
      href: `/stores/${encodeURIComponent("가게")}`,
    });
    expect(resolveOwnerHomeStoreTarget({ ...ok, slug: "" })).toEqual({ kind: "unavailable", reason: "no_slug" });
    for (const approvalStatus of ["pending", "rejected", "suspended", "revision_requested", null]) {
      expect(resolveOwnerHomeStoreTarget({ slug: "my-shop", approvalStatus })).toEqual({
        kind: "unavailable",
        reason: "not_approved",
      });
    }
  });

  it("숨김 안내 문구(「노출을 켜면 열 수 있어요」) 없음 — 관리자 잠금 매장은 켤 수 없으므로", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("components/stores/owner/OwnerMobileBottomNav.tsx", "utf8")).not.toContain("hidden_desc");
    expect(readFileSync("lib/i18n/catalog/popup-ssot-wording.ts", "utf8")).not.toContain(
      "popup_owner_home_store_unavailable_hidden_desc"
    );
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
