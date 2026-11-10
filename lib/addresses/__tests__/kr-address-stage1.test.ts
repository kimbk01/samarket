/**
 * 한국 주소 지원 1단계 (Owner 2026-11-10 「시안대로 구현」) — 시/군/구 판정·한국 해석·표시·저장 위치·배달 안내.
 */
import { describe, expect, it } from "vitest";
import {
  isKoreaLatLng,
  isKrRegionId,
  krRegionDisplayName,
  krRegionShortName,
  normalizeKrSido,
  resolveKrSigunguCode,
} from "@/lib/addresses/kr/kr-sigungu";
import { parseKrGoogleAddress, stripKoreaCountry } from "@/lib/addresses/kr/kr-google-address";
import { deriveAddressLocation } from "@/lib/addresses/address-location-ssot.server";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import {
  addressDisplayPartsFromUserAddress,
  formatAddressDeliveryArea,
  formatAddressFullLines,
  formatAddressPublicArea,
} from "@/lib/addresses/address-display-levels";
import { resolveDeliveryViewerGate } from "@/lib/stores/delivery-viewer-gate";
import data from "@/data/kr-sigungu/kr-sigungu.json";

const comp = (long_name: string, ...types: string[]) => ({ long_name, short_name: long_name, types });

describe("시/군/구 표 (국토교통부 전국 법정동 2026-07-29)", () => {
  it("자치단체 230곳, 일반구는 상위 시로", () => {
    expect((data as { units: unknown[] }).units.length).toBe(230);
    expect(resolveKrSigunguCode({ sido: "서울특별시", names: ["강남구"] })).toBe("11680");
    expect(resolveKrSigunguCode({ sido: "경기도", names: ["장안구", "수원시"] })).toBe("41110");
    expect(resolveKrSigunguCode({ sido: "경기도", names: ["수원시장안구"] })).toBe("41110");
  });
  it("같은 이름 구는 시도로 구분 · 없는 이름은 null(추정 금지)", () => {
    expect(resolveKrSigunguCode({ sido: "서울특별시", names: ["중구"] })).toBe("11140");
    expect(resolveKrSigunguCode({ sido: "부산광역시", names: ["중구"] })).toBe("26110");
    expect(resolveKrSigunguCode({ sido: "서울특별시", names: ["없는구"] })).toBeNull();
    expect(resolveKrSigunguCode({ sido: null, names: ["강남구"] })).toBeNull();
  });
  it("예전·줄임 시도 이름 (구글 자료 지연 대비)", () => {
    expect(normalizeKrSido("강원도")).toBe("강원특별자치도");
    expect(normalizeKrSido("전라북도")).toBe("전북특별자치도");
    expect(normalizeKrSido("광주광역시")).toBe("전남광주통합특별시");
    expect(resolveKrSigunguCode({ sido: "광주광역시", names: ["광산구"] })).toBe("12330");
  });
  it("표시 이름 — 시도 줄임말 + 시/군/구", () => {
    expect(krRegionDisplayName("KR:11680")).toBe("서울 강남구");
    expect(krRegionShortName("KR:11680")).toBe("강남구");
    expect(krRegionDisplayName("KR:36110")).toBe("세종시");
    expect(isKrRegionId("KR:11680")).toBe(true);
    expect(isKrRegionId("1381300000")).toBe(false);
  });
  it("좌표 나라 판정", () => {
    expect(isKoreaLatLng(37.5006, 127.0364)).toBe(true);
    expect(isKoreaLatLng(14.6, 121.0)).toBe(false);
  });
});

describe("구글 결과(한국어) 해석", () => {
  it("서울 강남구 역삼동 — 도로명 한 줄·동·우편번호", () => {
    const p = parseKrGoogleAddress(
      [
        comp("152", "premise"),
        comp("역삼동", "political", "sublocality", "sublocality_level_2"),
        comp("강남구", "political", "sublocality", "sublocality_level_1"),
        comp("서울특별시", "administrative_area_level_1", "political"),
        comp("대한민국", "country", "political"),
        comp("06236", "postal_code"),
      ] as google.maps.GeocoderAddressComponent[],
      "대한민국 서울특별시 강남구 테헤란로 152",
    );
    expect(p).toMatchObject({ sido: "서울특별시", sigunguCode: "11680", sigunguName: "강남구", dong: "역삼동", postalCode: "06236" });
    expect(p.roadLine).toBe("서울특별시 강남구 테헤란로 152");
    expect(stripKoreaCountry("대한민국 부산광역시 중구")).toBe("부산광역시 중구");
  });
});

describe("저장 위치 · 표시 (기존 칸 그대로)", () => {
  const kr = rowToUserAddressDTO({
    id: "k1",
    user_id: "u1",
    country_code: "KR",
    country_name: "South Korea",
    province: "서울특별시",
    city_municipality: "강남구",
    barangay: "역삼동",
    street_address: "서울특별시 강남구 테헤란로 152",
    formatted_address: "서울특별시 강남구 테헤란로 152",
    building_name: "강남파이낸스센터",
    unit_floor_room: "12층 1201호",
  });
  it("서버 위치 = KR:시/군/구 (앱 동네 목록 미사용)", () => {
    expect(deriveAddressLocation(kr)).toEqual({
      cityMunicipality: "강남구",
      appRegionId: null,
      appCityId: null,
      canonicalLguId: "KR:11680",
    });
  });
  it("① 「서울 강남구」 ② 「역삼동, 강남구」 ③ 「장소, 도로명」 + 상세", () => {
    const parts = addressDisplayPartsFromUserAddress({ ...kr, canonicalLguId: "KR:11680" });
    expect(formatAddressPublicArea(parts)).toBe("서울 강남구");
    expect(formatAddressDeliveryArea(parts)).toBe("역삼동, 강남구");
    expect(formatAddressFullLines(parts)).toEqual({
      main: "강남파이낸스센터, 서울특별시 강남구 테헤란로 152",
      detail: "12층 1201호",
    });
  });
  it("필리핀 주소는 그대로", () => {
    const ph = rowToUserAddressDTO({ id: "p1", user_id: "u1", city_municipality: "Quezon City", province: "Metro Manila" });
    expect(deriveAddressLocation(ph).canonicalLguId).toBe("1381300000");
  });
});

describe("4단계 — 한국 대표 주소 = 배달 지역 아님", () => {
  it("KR 지역 코드면 not_service_area, 필리핀은 ok", () => {
    expect(resolveDeliveryViewerGate({ source: "saved_address", userId: "u", canonicalLguId: "KR:11680" })).toBe("not_service_area");
    expect(resolveDeliveryViewerGate({ source: "saved_address", userId: "u", canonicalLguId: "1381300000" })).toBe("ok");
  });
});
