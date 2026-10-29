/**
 * S-07·S-08 — 검색도 목록과 같은 열람 게이트: 비로그인·주소 없는 회원은 DB 조회 없이 빈 결과 + meta.viewer_gate.
 */
import { describe, expect, it, vi } from "vitest";

const fromSpy = vi.fn(() => {
  throw new Error("DB must not be queried when viewer gate blocks");
});
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => ({ from: fromSpy }),
}));
vi.mock("@/lib/stores/load-store-search-top-banners", () => ({
  loadStoresSearchTopBannerSlide: async () => null,
}));

import { searchDeliveryDomain } from "@/lib/delivery/search/search-delivery";

const base = { lat: null, lng: null, canonicalLguId: null };

describe("searchDeliveryDomain viewer gate", () => {
  it("비로그인 → login_required, 매장·메뉴 없음", async () => {
    const r = await searchDeliveryDomain({ q: "chicken", origin: { ...base, source: "none", userId: null } });
    expect(r.meta.viewer_gate).toBe("login_required");
    expect(r.stores).toEqual([]);
    expect(r.menus).toEqual([]);
    expect(r.result_count).toBe(0);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("비로그인 + 쿼리 좌표도 login_required", async () => {
    const r = await searchDeliveryDomain({
      q: "chicken",
      origin: { source: "explicit_coords", userId: null, lat: 14.6, lng: 121, canonicalLguId: null },
    });
    expect(r.meta.viewer_gate).toBe("login_required");
    expect(r.stores).toEqual([]);
  });

  it("회원 + 저장 주소 없음 → address_required, 매장·메뉴 없음", async () => {
    const r = await searchDeliveryDomain({ q: "chicken", origin: { ...base, source: "none", userId: "u1" } });
    expect(r.meta.viewer_gate).toBe("address_required");
    expect(r.stores).toEqual([]);
    expect(r.menus).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
