/**
 * 주소 SSOT 3단계 (Owner 2026-11-09 「범위를 벌리지 말고 정확히 구현」) — M1·M2·M4·M5 회귀 고정.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveAddressLocation } from "@/lib/addresses/address-location-ssot.server";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { appLocationIdsToCanonicalLguId } from "@/lib/addresses/app-location-lgu";
import { resolveTradeNationalLgu } from "@/lib/trade/location/national/resolve-trade-national-lgu";

const base = {
  appRegionId: null,
  appCityId: null,
  neighborhoodName: null,
  fullAddress: null,
  formattedAddress: null,
  roadAddress: null,
  buildingName: null,
  landmark: null,
  barangay: null,
  district: null,
  cityMunicipality: null,
  province: null,
  streetAddress: null,
};
const id = (r: ReturnType<typeof resolveTradeNationalLgu>) => (r.status === "resolved" ? r.canonicalId : r.status);

describe("M1 — 다른 시/군의 같은 이름 동네를 배정하지 않는다", () => {
  it("San Jose, Nueva Ecija → LGU San Jose City(NE), 앱 동네 없음(QC q28 아님)", () => {
    const d = deriveAddressLocation({
      ...base,
      formattedAddress: "Maharlika Hwy, San Jose, Nueva Ecija, Philippines",
      cityMunicipality: "San Jose",
      province: "Nueva Ecija",
    });
    expect(d.canonicalLguId).toBe("0304926000");
    expect(d.appRegionId).toBeNull();
    expect(d.appCityId).toBeNull();
  });

  it("저장된 동네 ID 가 LGU 와 다르면 버린다 (운영 행: Pasig LGU + quezon/q8)", () => {
    const v = mapUserAddressToAppLocation({ ...base, appRegionId: "quezon", appCityId: "q8", canonicalLguId: "1381200000" });
    if (v) expect(appLocationIdsToCanonicalLguId(v.regionId, v.cityId)).toBe("1381200000");
  });

  it("같은 시/군이면 그대로 (Diliman, Quezon City → quezon/q1)", () => {
    const d = deriveAddressLocation({
      ...base,
      formattedAddress: "Ra Cafe, 24k mansion, Sct. Tuason Street, Diliman, Quezon City, Metro Manila, Philippines",
      cityMunicipality: "Quezon City",
      province: "Metro Manila",
      barangay: "Diliman",
    });
    expect(d.canonicalLguId).toBe("1381300000");
    expect(d.appRegionId).toBe("quezon");
    expect(d.appCityId).toBe("q1");
    expect(appLocationIdsToCanonicalLguId(d.appRegionId, d.appCityId)).toBe("1381300000");
  });

  it("LGU 없으면 대조 없이 기존 순서 (Quiapo, Manila 우편번호)", () => {
    const v = mapUserAddressToAppLocation({ ...base, formattedAddress: "Quiapo, Manila, 1001 Metro Manila" });
    expect(v).toEqual({ regionId: "manila", cityId: "m5" });
  });
});

describe("M4 — 「Quezon」(주·도)을 Quezon City 로 판정하지 않는다", () => {
  it.each([
    ["Quezon", "Isabela", "0203122000"],
    ["Quezon", "Bukidnon", "1001317000"],
    ["Quezon", "Quezon", "0405637000"],
    ["Quezon", "Nueva Ecija", "0304922000"],
    ["San Juan", "Batangas", "0401023000"],
  ])("%s, %s → %s", (city, province, want) => {
    expect(id(resolveTradeNationalLgu({ cityMunicipality: city, province }))).toBe(want);
  });

  it("도 없는 「Quezon」 은 확정하지 않는다(추정 금지)", () => {
    expect(id(resolveTradeNationalLgu({ cityMunicipality: "Quezon" }))).not.toBe("1381300000");
    expect(resolveTradeNationalLgu({ cityMunicipality: "Quezon" }).status).not.toBe("resolved");
  });

  it("기존 정상 판정 유지", () => {
    expect(id(resolveTradeNationalLgu({ cityMunicipality: "Quezon City", province: "Metro Manila" }))).toBe("1381300000");
    expect(id(resolveTradeNationalLgu({ cityMunicipality: "Quezon City", province: "Kalakhang Maynila" }))).toBe("1381300000");
    expect(id(resolveTradeNationalLgu({ cityMunicipality: "Quezon City" }))).toBe("1381300000");
    expect(id(resolveTradeNationalLgu({ cityMunicipality: "Manila", province: "Metro Manila" }))).toBe("1380600000");
    expect(id(resolveTradeNationalLgu({ cityMunicipality: "Cainta", province: "Calabarzon" }))).toBe("0405805000");
    expect(id(resolveTradeNationalLgu({ cityMunicipality: "Bacoor", province: "Cavite" }))).toBe("0402103000");
    expect(id(resolveTradeNationalLgu({ cityMunicipality: "San Juan", province: "Metro Manila" }))).toBe("1381400000");
  });
});

describe("M2 — 거래 글 수정은 주소를 고른 경우에만 위치를 다시 정한다", () => {
  const src = readFileSync(join(process.cwd(), "app/api/posts/[postId]/owner-trade-update/route.ts"), "utf8");
  it("주소 없이 대표 주소로 바꾸던 조건 제거", () => {
    expect(src).not.toContain("proposed.trade_lgu_id || body.tradeAddressId");
    expect(src).toContain("loc.addressId === addressId");
    expect(src).toContain("region: before.region, city: before.city, trade_lgu_id: before.trade_lgu_id");
  });
});

describe("M5 — 새 상품 거래 지역은 REGIONS 선택칸이 아니다", () => {
  const src = readFileSync(join(process.cwd(), "components/product/form/ProductLocationSelect.tsx"), "utf8");
  it("대표 주소 시/군 표시", () => {
    expect(src).not.toContain("@/lib/products/form-options");
    expect(src).toContain("formatAddressPublicArea");
  });
});
