import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("CUT 1 — store location writer / invalidation SSOT", () => {
  it("exports afterCanonicalStoreLocationWrite with required side effects", () => {
    const src = read("lib/stores/after-canonical-store-location-write.ts");
    expect(src).toContain("export function afterCanonicalStoreLocationWrite");
    expect(src).toContain("invalidateDiscoveryAfterStoreWrite");
    expect(src).toContain("clearStoreHomeFeedServerCache");
    expect(src).toContain("invalidateStorePublicCachesForSlugOnServer");
    expect(src).toContain("invalidateMeStoresListServerCache");
  });

  it("Owner / Admin / shop-linked writers all call the canonical post-write hook", () => {
    // 3-C — 저장 본문은 공용 코어로 이동 (오너 = 매장 프로필 코어, 관리자 = PATCH 실행 함수)
    const owner = read("lib/stores/owner-catalog/store-profile-core.server.ts");
    const admin = read("lib/admin-business/execute-admin-store-patch-action.server.ts");
    const shop = read("lib/addresses/resolve-user-address-shop-write.ts");

    expect(owner).toContain("afterCanonicalStoreLocationWrite");
    expect(admin).toContain("afterCanonicalStoreLocationWrite");
    expect(shop).toContain("afterCanonicalStoreLocationWrite");

    // Shop sync must not rely on discovery-only invalidation without HOME clear
    expect(shop).not.toMatch(
      /invalidateDiscoveryStoreProjections\(sb,\s*sid,\s*\{\s*reasons:\s*\["store_geo"\]\s*\}\)/
    );
  });

  it("HOME feed caches distance-axis results only under a viewer+policy safe key (묶음4 F-05)", () => {
    const home = read("app/api/stores/home-feed/route.ts");
    /** 사용자별 배달 범위 판정 재료(주소·좌표·LGU = origin.cacheKeyPart) + 거리 정책 전체 해시 + 언어 */
    expect(home).toContain("originKey: origin.cacheKeyPart");
    expect(home).toContain("distancePolicyKey: buildStoreHomeFeedServiceabilityPolicyKey(serviceabilityCtx)");
    expect(home).toMatch(/\n\s+uiLang,\n/);
    /** 매장 위치 쓰기 → 프로세스 캐시 즉시 비움 (위 writer 훅) */
    expect(read("lib/stores/after-canonical-store-location-write.ts")).toContain("clearStoreHomeFeedServerCache()");
  });
});
