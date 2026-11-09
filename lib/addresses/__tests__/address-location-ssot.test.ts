/**
 * 주소 SSOT 1단계 (Owner 2026-11-09) — 운영에서 확인한 실제 행으로 저장·조회·화면 값을 고정한다.
 * zxzx11 대표(qqq): city_municipality·app_region_id·app_city_id·canonical_lgu_id 모두 NULL (2026-04 폼 저장).
 */
import { describe, expect, it } from "vitest";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import {
  deriveAddressLocation,
  deriveCityMunicipalityFromAddressText,
  withDerivedAddressLocation,
} from "@/lib/addresses/address-location-ssot.server";
import {
  extractPhilippinesPostalCodeFromAddressLine,
  mapUserAddressToAppLocation,
} from "@/lib/addresses/map-user-address-to-app-location";
import { formatPublicAddress } from "@/lib/addresses/user-address-format";
import {
  resolveExplorationAddressLineFromSnapshot,
  resolveRepresentativeFullAddressLineFromSnapshot,
} from "@/lib/addresses/address-defaults-snapshot-resolvers";
import { resolveRequiredAddressFromSnapshot } from "@/lib/mypage/required-address-from-snapshot";
import {
  formatCommunityLocalFilterLabel,
  seedCommunityLocalFilterFromMaster,
} from "@/lib/community/community-local-filter-ssot";
import { lookupExactLocationByPhilippinesZip } from "@/lib/products/zip-to-location";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";

const ZXZX11_MASTER_ROW = {
  id: "1e224ab1-df6f-4292-850c-cfa95ccc0608",
  user_id: "0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc",
  label_type: "home",
  nickname: "qqq",
  province: null,
  city_municipality: null,
  barangay: null,
  district: null,
  street_address: null,
  building_name: null,
  unit_floor_room: "zxzx22",
  detail_address: "zxzx22",
  latitude: 14.5995,
  longitude: 120.9842,
  place_id: null,
  full_address: "684-718, 1001 Paterno St, Quiapo, Manila, 1001 Metro Manila, 필리핀",
  formatted_address: "684-718, 1001 Paterno St, Quiapo, Manila, 1001 Metro Manila, 필리핀",
  road_address: null,
  neighborhood_name: null,
  app_region_id: null,
  app_city_id: null,
  canonical_lgu_id: null,
  is_default_master: true,
  is_active: true,
};

const ZXZX11_OTHER_ROW = {
  ...ZXZX11_MASTER_ROW,
  id: "441a15b7-3f9a-437a-85ae-2c6335910eb7",
  nickname: "55",
  province: "null",
  barangay: "null",
  full_address: "913 Ongpin St, Santa Cruz, Manila, 1003 Metro Manila, 필리핀",
  formatted_address: "913 Ongpin St, Santa Cruz, Manila, 1003 Metro Manila, 필리핀",
  is_default_master: false,
};

function snapshotOf(master: unknown): AddressDefaultsSnapshot {
  return {
    ok: true,
    status: 200,
    defaults: { master, life: null, trade: null, delivery: null, activeCount: 2 },
  } as unknown as AddressDefaultsSnapshot;
}

/** API 응답과 같은 경로: DB 행 → DTO → 조회 SSOT → JSON */
function apiMaster(row: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(withDerivedAddressLocation(rowToUserAddressDTO(row))));
}

describe("주소 SSOT — 위치값 계산", () => {
  it("우편번호는 Google 형식 마지막 구간만 (번지 1226 은 우편번호 아님)", () => {
    expect(extractPhilippinesPostalCodeFromAddressLine(ZXZX11_MASTER_ROW.formatted_address)).toBe("1001");
    expect(extractPhilippinesPostalCodeFromAddressLine("1226 A Lorenzo St, Tondo, Manila, 1013 Metro Manila")).toBe("1013");
    expect(extractPhilippinesPostalCodeFromAddressLine("1226 A Lorenzo St, Tondo, Manila")).toBeNull();
  });

  it("Manila 우편번호 표 = PhilPost (1001 Quiapo · 1003 Santa Cruz · 1006 Binondo · 1011 Pandacan · 1013 Tondo)", () => {
    expect(lookupExactLocationByPhilippinesZip("1001")).toEqual({ regionId: "manila", cityId: "m5" });
    expect(lookupExactLocationByPhilippinesZip("1003")).toEqual({ regionId: "manila", cityId: "m11" });
    expect(lookupExactLocationByPhilippinesZip("1006")).toEqual({ regionId: "manila", cityId: "m4" });
    expect(lookupExactLocationByPhilippinesZip("1011")).toEqual({ regionId: "manila", cityId: "m14" });
    expect(lookupExactLocationByPhilippinesZip("1013")).toEqual({ regionId: "manila", cityId: "m9" });
    expect(lookupExactLocationByPhilippinesZip("1099")).toBeNull();
  });

  it("시/군은 공식 LGU 표로만 — 오른쪽 구간부터 (Quiapo 는 시가 아님 → Manila)", () => {
    expect(deriveCityMunicipalityFromAddressText([ZXZX11_MASTER_ROW.formatted_address])).toBe("Manila");
    expect(deriveCityMunicipalityFromAddressText(["M29W+2XM, 5 Renowned Ln, Quezon City, 1128 Metro Manila, 필리핀"])).toBe(
      "Quezon City",
    );
    expect(deriveCityMunicipalityFromAddressText(["Exchange Road, Barangay Ortigas Center, Metro Manila"])).toBeNull();
    // 줄바꿈으로 구분된 주소(운영 aa44·aa66·aa77·aa88)
    expect(deriveCityMunicipalityFromAddressText(["18 Don Mariano Marcos Ave\n18 Don Mariano Marcos Avenue\nQuezon City"])).toBe(
      "Quezon City",
    );
  });

  it("화면이 보낸 예전 지역 ID 보다 주소 문장 계산이 우선 (A6)", () => {
    const d = deriveAddressLocation({
      ...rowToUserAddressDTO(ZXZX11_MASTER_ROW),
      appRegionId: "manila",
      appCityId: "m4",
    });
    expect(d).toMatchObject({ cityMunicipality: "Manila", appRegionId: "manila", appCityId: "m5" });
    expect(d.canonicalLguId).toBe("1380600000");
  });

  it("주소 문장으로 계산이 안 될 때만 저장된 지역 ID 사용", () => {
    const d = deriveAddressLocation({
      ...rowToUserAddressDTO({ ...ZXZX11_MASTER_ROW, full_address: null, formatted_address: null }),
      appRegionId: "manila",
      appCityId: "m2",
    });
    expect(d.appCityId).toBe("m2");
  });

  it("문자 null 은 빈 값", () => {
    const dto = rowToUserAddressDTO(ZXZX11_OTHER_ROW);
    expect(dto.province).toBeNull();
    expect(withDerivedAddressLocation(dto)).toMatchObject({
      cityMunicipality: null,
      locationCityMunicipality: "Manila",
      appCityId: "m11",
    });
  });
});

describe("주소 SSOT — zxzx11 대표 주소가 모든 화면에서 같은 값", () => {
  const master = apiMaster(ZXZX11_MASTER_ROW);
  const snap = snapshotOf(master);

  // 공개 시/군 이름은 거래와 같은 LGU 이름(「Manila City」) — 주소 표시 SSOT(address-display-levels)
  it("홈 헤더 = Manila City (이전: null → 「주소 설정」)", () => {
    expect(resolveExplorationAddressLineFromSnapshot(snap)).toBe("Manila City");
  });

  it("내정보 필수정보 대표 주소 값 = Manila (이전: 빈칸)", () => {
    expect(resolveRequiredAddressFromSnapshot(snap)).toMatchObject({ status: "complete", publicLabel: "Manila City" });
    // 표시 필드는 바꾸지 않는다 — 전체 주소는 이전과 같은 한 줄
    expect(resolveRepresentativeFullAddressLineFromSnapshot(snap)).toBe(
      "zxzx22, 684-718, 1001 Paterno St, Quiapo, Manila",
    );
  });

  it("커뮤니티 글 지역 = Manila City (이전: 「동네」)", () => {
    expect(formatPublicAddress(master)).toBe("Manila City");
  });

  it("거래·하단 지역 = Quiapo (이전: Binondo) · 커뮤니티 보는 동네 = Manila City", () => {
    expect(mapUserAddressToAppLocation(master)).toEqual({ regionId: "manila", cityId: "m5" });
    // 주소 SSOT 2단계: 커뮤니티 「보는 동네」 = 시/군(LGU) — Manila City (거래 지역 ID 는 Quiapo 그대로)
    expect(formatCommunityLocalFilterLabel(seedCommunityLocalFilterFromMaster(master))).toBe("Manila City");
  });

  it("정상 계정 행(Makati, 2026-11-06)은 결과가 그대로", () => {
    const ok = apiMaster({
      ...ZXZX11_MASTER_ROW,
      id: "2f46",
      barangay: "Ayala Center",
      province: "Metro Manila",
      city_municipality: "Makati City",
      building_name: "Ayala Museum",
      street_address: "corner Dela Rosa Street",
      full_address: "corner Dela Rosa Street, Barangay Ayala Center, Makati City, Metro Manila",
      formatted_address: "corner Dela Rosa Street, Barangay Ayala Center, Makati City, Metro Manila",
      road_address: "corner Dela Rosa Street, Barangay Ayala Center, Makati City, Metro Manila",
      app_region_id: "manila",
      app_city_id: "m2",
      canonical_lgu_id: "1380300000",
    });
    expect(resolveExplorationAddressLineFromSnapshot(snapshotOf(ok))).toBe("Makati City");
    expect(mapUserAddressToAppLocation(ok)).toEqual({ regionId: "manila", cityId: "m2" });
    expect(ok.canonicalLguId).toBe("1380300000");
  });
});
