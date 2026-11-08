import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  buildExplicitCommunityLocalFilter,
  communityLocalFilterLocationKey,
  communityLocalFilterStorageKey,
  formatCommunityLocalFilterLabel,
  resolveCommunityLocalFilterAgainstMaster,
  seedCommunityLocalFilterFromMaster,
} from "@/lib/community/community-local-filter-ssot";

function addr(partial: Partial<UserAddressDTO> & { id: string }): UserAddressDTO {
  return {
    id: partial.id,
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: null,
    recipientName: null,
    phoneNumber: null,
    countryCode: "PH",
    countryName: "Philippines",
    province: "Metro Manila",
    cityMunicipality: partial.cityMunicipality ?? "Makati",
    barangay: partial.barangay ?? null,
    district: null,
    streetAddress: null,
    buildingName: null,
    unitFloorRoom: null,
    landmark: null,
    latitude: null,
    longitude: null,
    placeId: null,
    formattedAddress: null,
    roadAddress: null,
    detailAddress: null,
    deliveryNote: null,
    fullAddress: null,
    neighborhoodName: null,
    appRegionId: partial.appRegionId ?? "manila",
    appCityId: partial.appCityId ?? "m2",
    canonicalLguId: partial.canonicalLguId === undefined ? "1380300000" : partial.canonicalLguId,
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: true,
    isDefaultTrade: true,
    isDefaultDelivery: true,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("community local filter SSOT — 시/군 LGU (주소 SSOT 2단계)", () => {
  it("대표 주소 LGU 로 seed — 「보는 동네」 = 시/군 이름 (Makati City)", () => {
    const seeded = seedCommunityLocalFilterFromMaster(
      addr({ id: "m1", canonicalLguId: "1380300000", cityMunicipality: "Makati City" }),
    );
    expect(seeded).toEqual({ source: "seed", lguId: "1380300000", masterAddressId: "m1" });
    expect(formatCommunityLocalFilterLabel(seeded)).toBe("Makati City");
    expect(communityLocalFilterLocationKey(seeded)).toBe("lgu:1380300000:");
  });

  it("Quezon City 주소(바랑가이 Diliman)는 Quezon City — 동네 목록 이름(Diliman) 아님", () => {
    const seeded = seedCommunityLocalFilterFromMaster(
      addr({ id: "m1", canonicalLguId: "1381300000", cityMunicipality: "Quezon City", barangay: "Diliman" }),
    );
    expect(formatCommunityLocalFilterLabel(seeded)).toBe("Quezon City");
  });

  it("앱 동네 목록 밖 시/군(Caloocan·Bacoor)도 읽는다", () => {
    expect(formatCommunityLocalFilterLabel(seedCommunityLocalFilterFromMaster(addr({ id: "c", canonicalLguId: "1380100000" })))).toBe(
      "Caloocan City",
    );
    // Bacoor PSGC 0402103000 (data/trade-national-lgu 「City of Bacoor」) — 표기 통일 「Bacoor City」
    expect(formatCommunityLocalFilterLabel(buildExplicitCommunityLocalFilter("0402103000"))).toBe("Bacoor City");
  });

  it("LGU 없는 대표 주소는 seed 없음", () => {
    expect(seedCommunityLocalFilterFromMaster(addr({ id: "x", canonicalLguId: null }))).toBeNull();
  });

  it("explicit filter is preserved when master changes (CASE D)", () => {
    const explicit = buildExplicitCommunityLocalFilter("1381500000");
    expect(explicit?.source).toBe("explicit");
    const next = resolveCommunityLocalFilterAgainstMaster(explicit, addr({ id: "m2", canonicalLguId: "1381200000" }));
    expect(next).toEqual(explicit);
  });

  it("seed-only filter reseeds when master changes", () => {
    const seeded = seedCommunityLocalFilterFromMaster(addr({ id: "m1", canonicalLguId: "1380300000" }));
    const next = resolveCommunityLocalFilterAgainstMaster(seeded, addr({ id: "m9", canonicalLguId: "1381200000" }));
    expect(next).toMatchObject({ source: "seed", lguId: "1381200000", masterAddressId: "m9" });
  });

  /** 2026-11-09 iPhone: 키보드가 열리면 선택창 위쪽이 잘림 — 거래 검색과 같은 고정 높이 모드여야 한다 */
  it("지역 선택창 = 공용 시트 heightRatio 고정 높이 모드, 안쪽 vh 고정 높이 없음", () => {
    const sheet = readFileSync(join(process.cwd(), "components/community/CommunityLocalFilterPickerSheet.tsx"), "utf8");
    expect(sheet).toMatch(/heightRatio=\{0\.85\}/);
    expect(sheet).not.toMatch(/h-\[min\(\d+vh/);
    expect(sheet).toContain("min-h-0 flex-1 flex-col");
  });

  it("storage key is user-scoped", () => {
    expect(communityLocalFilterStorageKey("user-a")).toContain("user-a");
    expect(communityLocalFilterStorageKey("user-a")).not.toBe(
      communityLocalFilterStorageKey("user-b"),
    );
  });

  it("CommunityFeed no longer uses RegionContext for Local authority", () => {
    const feed = readFileSync(join(process.cwd(), "components/community/CommunityFeed.tsx"), "utf8");
    expect(feed).toContain("useCommunityLocalFilter");
    expect(feed).not.toContain("useRegionOptional");
    expect(feed).not.toContain("neighborhoodLocationKeyFromRegion");
  });

  it("filter picker / SSOT never writes user_addresses", () => {
    const ssot = readFileSync(
      join(process.cwd(), "lib/community/community-local-filter-ssot.ts"),
      "utf8",
    );
    const hook = readFileSync(join(process.cwd(), "hooks/use-community-local-filter.ts"), "utf8");
    expect(ssot).not.toContain("createUserAddress");
    expect(ssot).not.toContain("updateUserAddress");
    expect(ssot).not.toContain("isDefaultMaster");
    expect(hook).not.toContain("/api/me/addresses");
    expect(hook).toContain("fetchAddressDefaultsSnapshot");
  });

  it("CUT 1 City-only writer still uses formatPublicAddress", () => {
    const writer = readFileSync(
      join(process.cwd(), "lib/addresses/community-public-region-label.ts"),
      "utf8",
    );
    expect(writer).toContain("formatPublicAddress");
    expect(writer).not.toContain("resolveUserAddressTitle");
  });
});
