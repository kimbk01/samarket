/**
 * 한국 주소 지원 1단계 (Owner 2026-11-10 「시안대로 구현」) — 시/군/구 판정·한국 해석·표시·저장 위치·배달 안내.
 */
import { readFileSync } from "node:fs";
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
  it("배달 홈: 한국 주소면 매장 모집 화면(배너·흐림·팝업)을 걸지 않고 안내를 보인다", () => {
    const src = readFileSync("components/stores/home/hub/StoresHomeHub.tsx", "utf8");
    expect(src).toMatch(/recruitingShown = recruiting && blockedViewerGate !== "not_service_area"/);
    expect(src).toMatch(/<StoresHomeRecruitingDim state=\{recruitingShown \? launchState : null\}>/);
    expect(src).toMatch(/\{recruitingShown && launchState \? <DeliveryRecruitingOverlays/);
    expect(src).not.toMatch(/state=\{recruiting \? launchState/);
  });
});

describe("2단계 — 거래 지역에 한국 시/군/구", async () => {
  const { assertActiveTradeNationalLgu } = await import("@/lib/trade/location/national/assert-active-trade-national-lgu");
  const { getTradeNationalLguDisplayNameById } = await import("@/lib/trade/location/national/lgu-display-by-id");
  const { resolveTradeLguUrlTokenToCanonical } = await import("@/lib/trade/location/national/legacy-product-alias-canonical");
  it("KR 코드 = 유효한 거래 지역, 모르는 KR 코드는 거부", () => {
    const ok = assertActiveTradeNationalLgu("KR:11680");
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.lgu.lguType).toBe("kr_sigungu");
    expect(assertActiveTradeNationalLgu("KR:99999").ok).toBe(false);
    expect(assertActiveTradeNationalLgu("1381300000").ok).toBe(true);
  });
  it("표시 이름·주소창 토큰", () => {
    expect(getTradeNationalLguDisplayNameById("KR:11680")).toBe("서울 강남구");
    expect(resolveTradeLguUrlTokenToCanonical("kr:11680")).toBe("KR:11680");
    expect(resolveTradeLguUrlTokenToCanonical("KR:11680")).toBe("KR:11680");
  });
  it("마이그레이션 = 공식 표 230행 그대로", () => {
    const sql = readFileSync("supabase/migrations/20271110210000_trade_national_lgu_kr_sigungu.sql", "utf8");
    expect((sql.match(/\('KR:\d{5}', 'kr_sigungu'/g) ?? []).length).toBe(230);
    expect(sql).toContain("('KR:11680', 'kr_sigungu', '서울 강남구', '11', '서울특별시'");
    expect(sql).toContain("CHECK (lgu_type IN ('city', 'municipality', 'kr_sigungu'))");
  });
});

describe("3단계 — 거래 가격 통화", async () => {
  const m = await import("@/lib/trade/trade-price-currency");
  it("저장값 우선, 없으면 앱 기본 · 대표 주소 나라 기본값 · 서버 정리", () => {
    expect(m.resolveTradePostCurrency({ currency: "KRW" }, "PHP")).toBe("KRW");
    expect(m.resolveTradePostCurrency({}, "PHP")).toBe("PHP");
    expect(m.resolveTradePostCurrency({ currency: "USD" }, "PHP")).toBe("PHP");
    expect(m.defaultTradePriceCurrencyForCountry("KR")).toBe("KRW");
    expect(m.defaultTradePriceCurrencyForCountry("PH")).toBe("PHP");
    expect(m.sanitizeTradeMetaCurrency({ currency: "krw", a: 1 })).toEqual({ currency: "KRW", a: 1 });
    expect(m.sanitizeTradeMetaCurrency({ currency: "USD", a: 1 })).toEqual({ a: 1 });
  });
  it("글쓰기 = 통화 라디오 + meta.currency 저장 · 목록 모델은 글 통화 사용", () => {
    const form = readFileSync("components/write/trade/TradeWriteForm.tsx", "utf8");
    expect(form).toContain("<TradePriceCurrencyRadio");
    expect(form).toContain("trade_chat_call_policy: tradeChatCallPolicy, currency: priceCurrency");
    const model = readFileSync("lib/posts/post-list-preview-model.ts", "utf8");
    expect(model).toContain('resolveTradePostCurrency(meta, opts.currency || "KRW")');
  });
});

describe("3단계 보강 — 판매·구매 내역 · 가격 제안 · 다른 업종", () => {
  it("판매·구매 내역 행이 글 통화를 싣고 카드가 쓴다", () => {
    expect(readFileSync("app/api/my/sales/route.ts", "utf8").match(/currency: summary\.currency/g)?.length).toBe(2);
    expect(readFileSync("app/api/my/purchases/route.ts", "utf8")).toContain("currency: summary.currency");
    expect(readFileSync("components/mypage/sales/SalesHistoryCard.tsx", "utf8")).toContain("formatPrice(row.price, row.currency || currency)");
    expect(readFileSync("components/mypage/purchases/PurchaseHistoryCard.tsx", "utf8")).toContain("formatPrice(row.price, row.currency || currency)");
  });
  it("가격 제안 문구·내 제안 목록 = 글 통화", () => {
    const srv = readFileSync("lib/offers/price-offers.server.ts", "utf8");
    expect(srv).not.toMatch(/formatOfferAmount\([^,()]+\)/);
    expect(srv).toContain("currency: resolveTradePostCurrency(row.meta");
    expect(readFileSync("lib/offers/offers-map.ts", "utf8")).toContain("productCurrency: post?.currency ?? null");
    expect(readFileSync("components/offers/MyOffersView.tsx", "utf8")).toContain("formatOfferMoney(offer.offeredPrice, offer.productCurrency)");
  });
  it("부동산·렌터카·중고차·일자리도 통화 선택 + 저장", () => {
    const form = readFileSync("components/write/trade/TradeWriteForm.tsx", "utf8");
    expect(form.match(/<TradePriceCurrencyRadio/g)?.length).toBe(4);
    const jobs = readFileSync("components/write/trade/generic/JobsExtendedWriteFields.tsx", "utf8");
    expect(jobs).toContain("<TradePriceCurrencyRadio");
    expect(jobs).toContain("meta = { ...meta, currency };");
    expect(readFileSync("components/write/WriteSheetFlowInner.tsx", "utf8")).toContain("getCurrencyUnitLabel(masterTradeCurrency)");
  });
});
