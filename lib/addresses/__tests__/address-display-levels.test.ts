/**
 * 주소 표시 SSOT (Owner 2026-11-09 「1단계 진행」) — 예시 주소로 화면별 실제 함수 결과를 고정한다.
 * 「Ra Cafe, 24k mansion, Sct. Tuason Street, Diliman, Quezon City, Metro Manila, Philippines」
 *   ① 공개 지역 = Quezon City · ② 배달 지역 = Diliman, Quezon City · ③ 전체 주소
 */
import { describe, expect, it } from "vitest";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import {
  resolveExplorationAddressLineFromSnapshot,
} from "@/lib/addresses/address-defaults-snapshot-resolvers";
import { resolveRequiredAddressFromSnapshot } from "@/lib/mypage/required-address-from-snapshot";
import { formatPublicAddress, toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
import { resolveDeliveryHomeHeaderDisplayLine } from "@/lib/addresses/delivery-home-header-address";
import { formatCommunityPublicRegionLabel } from "@/lib/addresses/community-public-region-label";
import {
  resolveTradeCardCityAreaLine,
  resolveTradePostListingLocationLine,
} from "@/lib/posts/post-listing-location-label";
import { buildPostRegionLabel } from "@/lib/chats/post-region-label";
import {
  formatStoreLocationLine,
  formatStorePickupAddressLines,
  resolveStoreRegionCityLabels,
} from "@/lib/stores/store-location-label";
import {
  addressDisplayPartsFromStoreRow,
  addressDisplayPartsFromUserAddress,
  formatAddressDeliveryArea,
  formatAddressFullLines,
  formatAddressPublicArea,
} from "@/lib/addresses/address-display-levels";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";

const EXAMPLE_ROW = {
  id: "ex",
  is_default_master: true,
  is_active: true,
  label_type: "home",
  building_name: "Ra Cafe",
  street_address: "Sct. Tuason Street",
  barangay: "Diliman",
  city_municipality: "Quezon City",
  province: "Metro Manila",
  unit_floor_room: "24k mansion",
  detail_address: "24k mansion",
  formatted_address: "24k mansion, Sct. Tuason Street, Diliman, Quezon City, Metro Manila, Philippines",
  place_id: "p1",
  latitude: 14.63,
  longitude: 121.03,
  app_region_id: "quezon",
  app_city_id: "q1",
  canonical_lgu_id: "1381300000",
};

function snap(master: unknown): AddressDefaultsSnapshot {
  return {
    ok: true,
    status: 200,
    defaults: { master, life: null, trade: null, delivery: null, activeCount: 1 },
  } as unknown as AddressDefaultsSnapshot;
}

describe("주소 표시 3단계 — 예시 주소(회원 대표 주소)", () => {
  const dto = JSON.parse(JSON.stringify(rowToUserAddressDTO(EXAMPLE_ROW)));
  const parts = addressDisplayPartsFromUserAddress(dto);

  it("① 공개 지역 = Quezon City (홈 헤더·내정보·커뮤니티 글 지역)", () => {
    expect(formatAddressPublicArea(parts)).toBe("Quezon City");
    expect(resolveExplorationAddressLineFromSnapshot(snap(dto))).toBe("Quezon City");
    expect(resolveRequiredAddressFromSnapshot(snap(dto)).publicLabel).toBe("Quezon City");
    expect(formatPublicAddress(dto)).toBe("Quezon City");
  });

  it("② 배달 지역 = Diliman, Quezon City (배달 홈·매장 목록 헤더)", () => {
    expect(formatAddressDeliveryArea(parts)).toBe("Diliman, Quezon City");
    expect(resolveDeliveryHomeHeaderDisplayLine(dto)).toBe("Diliman, Quezon City");
  });

  it("③ 전체 주소 = 장소, 도로, 바랑가이, 시 + 세부 (결제·주문 배달 주소)", () => {
    expect(formatAddressFullLines(parts)).toEqual({
      main: "Ra Cafe, Sct. Tuason Street, Diliman, Quezon City",
      detail: "24k mansion",
    });
    const payload = toCheckoutDeliveryPayload(dto);
    expect(payload.summary_line).toBe("Ra Cafe, Sct. Tuason Street, Diliman, Quezon City");
    expect(payload.address_detail).toBe("24k mansion");
  });

  it("Manila 시 이름은 거래와 같은 「Manila City」, Makati 는 「Makati City」", () => {
    const manila = rowToUserAddressDTO({ ...EXAMPLE_ROW, city_municipality: "Manila", barangay: "Quiapo", canonical_lgu_id: "1380600000" });
    expect(formatPublicAddress(manila)).toBe("Manila City");
    expect(resolveDeliveryHomeHeaderDisplayLine(manila)).toBe("Quiapo, Manila City");
    const makati = rowToUserAddressDTO({ ...EXAMPLE_ROW, city_municipality: "Makati City", barangay: "San Lorenzo", canonical_lgu_id: "1380300000" });
    expect(formatPublicAddress(makati)).toBe("Makati City");
  });

  it("숫자 바랑가이는 「Barangay 171」 그대로", () => {
    const p = addressDisplayPartsFromUserAddress(
      rowToUserAddressDTO({ ...EXAMPLE_ROW, barangay: "Barangay 171", city_municipality: "Caloocan", canonical_lgu_id: "1380100000" }),
    );
    expect(formatAddressDeliveryArea(p)).toBe("Barangay 171, Caloocan City");
  });
});

describe("주소 표시 3단계 — 거래·채팅 (① 공개 지역)", () => {
  it("거래 카드·상세·채팅 헤더 모두 Quezon City", () => {
    const post = { tradeLguId: "1381300000", region: "quezon", city: "q1" };
    expect(resolveTradeCardCityAreaLine(post)).toBe("Quezon City");
    expect(resolveTradePostListingLocationLine(null, post.region, post.city, post.tradeLguId)).toBe("Quezon City");
    expect(buildPostRegionLabel({ trade_lgu_id: "1381300000", region: "quezon", city: "q1" })).toBe("Quezon City");
    expect(buildPostRegionLabel({ region: "quezon", city: "q1" })).toBe("Quezon City");
  });
});

describe("주소 표시 3단계 — 커뮤니티 글 카드 (① 공개 지역)", () => {
  it("locations 행(앱 동네 목록) → 시/군 이름: Makati 동네가 「Manila」로 나오던 결함", () => {
    const fromLocation = (city: string, name: string) =>
      formatAddressPublicArea(addressDisplayPartsFromStoreRow({ region: city, city: name }));
    expect(fromLocation("Manila", "Makati")).toBe("Makati City");
    expect(fromLocation("Quezon City", "Diliman")).toBe("Quezon City");
    expect(fromLocation("Manila", "Quiapo")).toBe("Manila City");
    expect(formatCommunityPublicRegionLabel({ locationCity: fromLocation("Manila", "Makati") })).toBe("Makati City");
  });
});

describe("주소 표시 3단계 — 매장 주소 (② 매장 카드 · ③ 매장 주소), 저장 형식 2가지 같은 결과", () => {
  const ownerForm = {
    region: "Quezon City",
    city: "Diliman",
    district: "Sct. Tuason Street",
    address_line1: "Ra Cafe, 24k mansion, Sct. Tuason Street",
    address_line2: "2F",
  };
  const googleForm = {
    region: "Metro Manila",
    city: "Quezon City",
    district: "Sct. Tuason Street",
    address_line1: "Sct. Tuason Street, Diliman",
    address_line2: "2F",
    formatted_address: "Sct. Tuason Street, Diliman, Quezon City, Metro Manila",
  };

  it("매장 카드 지역 = Diliman, Quezon City (이전: 오너 폼 「Quezon City · Diliman」, Google 형식 null)", () => {
    expect(formatStoreLocationLine(ownerForm)).toBe("Diliman, Quezon City");
    expect(formatStoreLocationLine(googleForm)).toBe("Diliman, Quezon City");
  });

  it("매장 정보 「지역」= Quezon City · 「동네」= Diliman", () => {
    expect(resolveStoreRegionCityLabels(googleForm)).toEqual({ regionLabel: "Quezon City", neighborhoodLabel: "Diliman" });
    expect(resolveStoreRegionCityLabels(ownerForm)).toEqual({ regionLabel: "Quezon City", neighborhoodLabel: "Diliman" });
  });

  it("매장 주소(픽업) = 세부, 도로, 바랑가이, 시 (이전: Google 형식은 시 빠짐)", () => {
    const line = formatStorePickupAddressLines(googleForm)[0] ?? "";
    expect(line).toContain("2F");
    expect(line).toContain("Sct. Tuason Street");
    expect(line).toContain("Diliman");
    expect(line).toContain("Quezon City");
    const owner = formatStorePickupAddressLines(ownerForm)[0] ?? "";
    expect(owner).toContain("Diliman");
    expect(owner).toContain("Quezon City");
    expect(owner).not.toContain("·");
  });
});
