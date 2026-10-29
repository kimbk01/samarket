/**
 * Owner 2026-10-29 배달 노출 기준 — 비로그인 로그인 유도 · 주소 없는 회원 배너 · 회원 = 배달 가능 실매장만 ·
 * 샘플 = 주소 무관 노출 + 배지 · legacy_test 고객 비노출. 판정은 한 곳씩만.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldExcludeStoreFromMemberDeliveryList } from "@/lib/delivery/delivery-list-oor-policy";
import { browseRouteOriginFromDeliveryOrigin } from "@/lib/stores/browse-route-origin";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("회원 배달 목록 단일 판정", () => {
  it("홈·업종(신/구)·검색·배너가 같은 함수만 쓴다", () => {
    for (const f of [
      "app/api/stores/home-feed/route.ts",
      "lib/stores/stores-browse-build.ts",
      "lib/stores/discovery/load-store-discovery-ranked-live.ts",
      "lib/delivery/search/search-delivery.ts",
      "lib/stores/advertising/banner-viewer-serviceability.ts",
    ]) {
      expect(read(f), f).toContain("shouldExcludeStoreFromMemberDeliveryList(");
    }
    expect(read("lib/delivery/delivery-list-oor-policy.ts")).not.toContain("HOME_DISCOVERY_SHELVES_ALLOW_OOR");
    expect(read("lib/delivery/delivery-list-oor-policy.ts")).not.toContain("shouldExcludeOutOfRangeFromNormalList");
  });

  it("주소 없는 회원: 실매장 제외 · 샘플 유지 · 비로그인과 캐시 분리", () => {
    expect(shouldExcludeStoreFromMemberDeliveryList({ originSource: "member_no_address", distanceOutOfRange: false, storeKind: "real" })).toBe(true);
    expect(shouldExcludeStoreFromMemberDeliveryList({ originSource: "member_no_address", distanceOutOfRange: false, storeKind: "sample" })).toBe(false);
    const base = { userId: "u", addressId: null, placeId: null, lat: null, lng: null, addressIdentity: null, canonicalLguId: null };
    const member = browseRouteOriginFromDeliveryOrigin({ ...base, source: "member_no_address", cacheKeyPart: "member-none" });
    const guest = browseRouteOriginFromDeliveryOrigin({ ...base, userId: null, source: "none", cacheKeyPart: "none" });
    expect(member.source).toBe("member_no_address");
    expect(member.cacheGeoPart).not.toBe(guest.cacheGeoPart);
    expect(read("lib/stores/store-list-delivery-origin.ts")).toContain('source: userId ? "member_no_address" : "none"');
  });

  it("검색은 홈·업종과 같은 회원 origin", () => {
    const src = read("lib/delivery/search/search-delivery.ts");
    expect(src).toContain("resolveMemberDeliveryOrigin(");
    expect(src).not.toContain("defaults.master?.latitude");
  });
});

describe("배달 진입 게이트 (DeliveryRoutableAddressGate 단일)", () => {
  it("비로그인(401) = 로그인 유도, 주소 없음 = 배너 + 화면 유지", () => {
    const src = read("components/addresses/DeliveryRoutableAddressGate.tsx");
    expect(src).toContain('setPhase("login")');
    expect(src).toContain('"address_missing"');
    expect(src).toContain("buildLoginHref(pathname)");
    expect(src).toContain("store_delivery_address_missing_banner");
    expect(src).not.toContain('setPhase("repair")');
  });
});

describe("legacy_test 고객 비노출 · 샘플 예외 정리", () => {
  it("고객 매장 조회에 같은 조건", () => {
    for (const f of [
      "lib/stores/store-discovery-candidate.ts",
      "lib/stores/get-approved-store-by-slug.ts",
      "lib/delivery/search/search-delivery.ts",
      "lib/stores/advertising/load-banner-store-eligibility.ts",
      "app/api/stores/route.ts",
    ]) {
      expect(read(f), f).toContain('.neq("store_kind", CUSTOMER_HIDDEN_STORE_KIND)');
    }
  });

  it("샘플: order_now·무료배달 배지 예외 없음, 주소 무시·주문 차단·배지만 유지", () => {
    expect(read("lib/stores/product/stores-home-data-source.ts")).not.toContain("store.isSample !== true");
    expect(read("lib/stores/presentation/resolve-store-list-card-badges.ts")).not.toContain("!outOfRange && !isSample");
    expect(read("lib/delivery/delivery-list-oor-policy.ts")).toContain('if (args.storeKind === "sample") return false;');
  });
});
