/**
 * S-07·S-08·S-09 — 배달 열람 게이트 단일 판정 (Owner 2026-10-29 08:59).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isDeliveryViewerGateBlocked,
  isDeliveryViewerGatedPath,
  readDeliveryViewerGate,
  resolveDeliveryViewerGate,
} from "@/lib/stores/delivery-viewer-gate";
import {
  isGuestPublicBrowsePath,
  shouldAllowUnauthenticatedHtmlRequest,
} from "@/lib/auth/guest-browse-access-policy";

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");

describe("resolveDeliveryViewerGate", () => {
  it("비로그인 = login_required (쿼리 좌표가 있어도)", () => {
    expect(resolveDeliveryViewerGate({ source: "none", userId: null })).toBe("login_required");
    expect(resolveDeliveryViewerGate({ source: "explicit_coords", userId: null })).toBe("login_required");
  });
  it("로그인 + 배달 가능 저장 주소 없음 = address_required", () => {
    expect(resolveDeliveryViewerGate({ source: "none", userId: "u1" })).toBe("address_required");
  });
  it("저장 주소 있음 = ok (기존 동작)", () => {
    expect(resolveDeliveryViewerGate({ source: "saved_address", userId: "u1" })).toBe("ok");
  });
  it("meta 읽기 — 없거나 모르는 값은 null(기존 응답 호환 = 열람 가능)", () => {
    expect(readDeliveryViewerGate({ viewer_gate: "address_required" })).toBe("address_required");
    expect(readDeliveryViewerGate({ viewer_gate: "ok" })).toBe("ok");
    expect(readDeliveryViewerGate({ viewer_gate: "x" })).toBeNull();
    expect(readDeliveryViewerGate(null)).toBeNull();
    expect(isDeliveryViewerGateBlocked(null)).toBe(false);
    expect(isDeliveryViewerGateBlocked("ok")).toBe(false);
    expect(isDeliveryViewerGateBlocked("login_required")).toBe(true);
  });
});

describe("isDeliveryViewerGatedPath — 홈·업종·검색·상세(하위 메뉴·상품)만", () => {
  it.each([
    "/stores",
    "/stores/browse/food",
    "/stores/search",
    "/stores/search?q=chicken",
    "/stores/my-shop",
    "/stores/my-shop/menu",
    "/stores/my-shop/p/123",
    "/stores/my-shop/info",
    "/stores/my-shop/reviews",
  ])("gated: %s", (p) => expect(isDeliveryViewerGatedPath(p)).toBe(true));

  it.each([
    "/stores/owner",
    "/stores/owner/x",
    "/stores/cart",
    "/stores/gift-mall",
    "/stores/my-shop/cart",
    "/stores/my-shop/checkout",
    "/stores/my-shop/report",
    "/market",
    "/community",
  ])("not gated: %s", (p) => expect(isDeliveryViewerGatedPath(p)).toBe(false));
});

describe("다른 서비스 비회원 정책 불변 (proxy allowlist)", () => {
  it("마켓·커뮤니티·필라이프·메신저 목록 비회원 통과 유지", () => {
    for (const p of ["/market", "/community", "/philife", "/community-messenger", "/post/1", "/search"]) {
      expect(shouldAllowUnauthenticatedHtmlRequest(p)).toBe(true);
    }
  });
  it("배달 HTML 은 화면 게이트(로그인 유도 패널)를 위해 계속 통과", () => {
    expect(isGuestPublicBrowsePath("/stores")).toBe(true);
    expect(isGuestPublicBrowsePath("/stores/browse/food")).toBe(true);
    expect(isGuestPublicBrowsePath("/stores/owner")).toBe(false);
  });
});

describe("배선 — 홈·업종·검색·화면이 같은 판정을 쓴다", () => {
  it("home-feed: 게이트를 서버 캐시 조회 전에 판정·목록 비움", () => {
    const src = read("app/api/stores/home-feed/route.ts");
    const gateAt = src.indexOf("resolveDeliveryViewerGate(origin)");
    expect(gateAt).toBeGreaterThan(0);
    expect(gateAt).toBeLessThan(src.indexOf("getStoreHomeFeedCache(cacheKey)"));
    expect(gateAt).toBeLessThan(src.indexOf("setStoreHomeFeedCache(cacheKey"));
    expect(src).toContain("viewer_gate: viewerGate");
  });
  it("browse: 게이트를 응답 캐시 조회 전에 판정·목록 비움", () => {
    const src = read("app/api/stores/browse/route.ts");
    const gateAt = src.indexOf("resolveDeliveryViewerGate(deliveryOrigin)");
    expect(gateAt).toBeGreaterThan(0);
    expect(gateAt).toBeLessThan(src.indexOf("peekStoresBrowseCache(browseCacheKey)"));
    expect(src).toContain("viewer_gate: viewerGate");
  });
  it("search(S-09): 목록과 같은 resolveStoreListDeliveryOrigin, 검색 전용 주소 조회 없음", () => {
    const route = read("app/api/stores/search/route.ts");
    expect(route).toContain("resolveStoreListDeliveryOrigin(sb, searchParams)");
    expect(route).not.toContain("getRouteUserId");
    const lib = read("lib/delivery/search/search-delivery.ts");
    expect(lib).toContain("resolveDeliveryViewerGate(input.origin)");
    expect(lib).not.toContain("getUserAddressDefaults");
    expect(lib).not.toContain("defaults.master");
  });
  it("고객 화면: 홈·업종·검색·검색 모달이 같은 패널, 레이아웃이 비로그인 게이트", () => {
    for (const p of [
      "components/stores/home/hub/StoresHomeHub.tsx",
      "components/stores/browse/StoresBrowsePrimaryView.tsx",
      "components/delivery/search/DeliverySearchPage.tsx",
    ]) {
      const src = read(p);
      expect(src, p).toContain("DeliveryViewerGatePanel");
      expect(src, p).toContain("readDeliveryViewerGate");
    }
    expect(read("components/stores/home/hub/StoresHomeSearchModal.tsx")).toContain("DeliveryViewerGatePanel");
    expect(read("hooks/use-delivery-store-search.ts")).toContain("readDeliveryViewerGate");
    const shell = read("components/delivery/navigation/StoresDeliveryLayoutShell.tsx");
    expect(shell.indexOf("<DeliveryViewerGuestGate>")).toBeLessThan(shell.indexOf("<DeliveryPresentationShell>"));
  });
});
