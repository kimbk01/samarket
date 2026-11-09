/**
 * 주소 SSOT 재감사 결함 H1~H5 (Owner 「H1~H5 수정」 2026-11-09) — 실제 함수로 재현한 입력을 고정.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveAddressLocation, deriveCityMunicipalityFromAddressText } from "@/lib/addresses/address-location-ssot.server";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import { toCheckoutDeliveryPayload } from "@/lib/addresses/user-address-format";
import {
  isCheckoutDeliveryGeoReady,
  resolveCheckoutDeliveryGeoFromUserAddress,
} from "@/lib/addresses/resolve-checkout-delivery-geo";

describe("H1 — 주소 문장에서 도·지역 이름을 시/군으로 판정하지 않는다", () => {
  it("「…, Bacoor, Cavite」 → Bacoor (Cavite 도 아님)", () => {
    expect(deriveCityMunicipalityFromAddressText(["Molino Rd, Molino III, Bacoor, Cavite, Philippines"])).toBe("Bacoor");
    expect(deriveCityMunicipalityFromAddressText(["Rizal St, Imus, Cavite"])).toBe("Imus");
  });
  it("「Brgy 1, Lucena, Quezon」 → Lucena (Quezon 도 → Quezon City 아님)", () => {
    expect(deriveCityMunicipalityFromAddressText(["Brgy 1, Lucena, Quezon"])).toBe("Lucena");
  });
  it("NCR 은 그대로 — 「…, Quiapo, Manila, 1001 Metro Manila」 → Manila", () => {
    expect(deriveCityMunicipalityFromAddressText(["684-718, 1001 Paterno St, Quiapo, Manila, 1001 Metro Manila, 필리핀"])).toBe(
      "Manila",
    );
  });
});

describe("H2 — 도로·바랑가이 칸이 없는 예전 행의 결제·주문 주소", () => {
  it("Google 한 줄 주소가 큰 줄 (시 이름만 남지 않음)", () => {
    const dto = rowToUserAddressDTO({
      id: "x",
      formatted_address: "Ra Cafe, 24k mansion, Sct. Tuason Street, Diliman, Quezon City, Metro Manila, Philippines",
      unit_floor_room: "Unit 5",
      canonical_lgu_id: "1381300000",
    });
    const p = toCheckoutDeliveryPayload(dto);
    expect(p.summary_line).toBe("Ra Cafe, 24k mansion, Sct. Tuason Street, Diliman, Quezon City");
    expect(p.address_detail).toBe("Unit 5");
  });
  it("zxzx11 형 예전 행 — 시/군 이름이 끝에 하나만", () => {
    const dto = rowToUserAddressDTO({
      id: "z",
      formatted_address: "684-718, 1001 Paterno St, Quiapo, Manila, 1001 Metro Manila, 필리핀",
      unit_floor_room: "zxzx22",
      canonical_lgu_id: "1380600000",
    });
    expect(toCheckoutDeliveryPayload(dto).summary_line).toBe("684-718, 1001 Paterno St, Quiapo, Manila");
  });
});

describe("H3 — 앱 동네 목록 형식(시/군=동네, 도=지역)도 시/군 LGU 확정", () => {
  it("Diliman / Quezon City → Quezon City, Quiapo / Manila → Manila", () => {
    expect(deriveAddressLocation({ cityMunicipality: "Diliman", province: "Quezon City" } as never).canonicalLguId).toBe(
      "1381300000",
    );
    expect(deriveAddressLocation({ cityMunicipality: "Quiapo", province: "Manila" } as never).canonicalLguId).toBe(
      "1380600000",
    );
  });
});

describe("H4 — 시/군·도를 바꾸지 않은 수정은 저장 거부하지 않는다", () => {
  it("서비스: 거부 조건 = 시/군·도 값이 실제로 바뀐 경우만", () => {
    const src = readFileSync(join(process.cwd(), "lib/addresses/user-address-service.ts"), "utf8");
    expect(src).toContain("if (!loc.canonicalLguId && cityOrProvinceChanged0) {");
  });
});

describe("H5 — 앱 동네 목록 밖 지역도 시/군 LGU 가 있으면 배달 주문 가능", () => {
  it("Bacoor 대표 주소 → 결제 준비됨 (동네 ID 없음, LGU 있음)", () => {
    const dto = rowToUserAddressDTO({
      id: "b",
      street_address: "Molino Road",
      barangay: "Molino III",
      city_municipality: "Bacoor",
      province: "Cavite",
      formatted_address: "Molino Road, Molino III, Bacoor, Cavite, Philippines",
      canonical_lgu_id: "0402103000",
    });
    const geo = resolveCheckoutDeliveryGeoFromUserAddress(dto);
    expect(geo?.lguId).toBe("0402103000");
    expect(geo?.regionId).toBe("");
    expect(isCheckoutDeliveryGeoReady(geo)).toBe(true);
  });
  it("LGU 도 동네 ID 도 없으면 준비 안 됨", () => {
    const dto = rowToUserAddressDTO({ id: "n", formatted_address: "Somewhere Road" });
    expect(isCheckoutDeliveryGeoReady(resolveCheckoutDeliveryGeoFromUserAddress(dto))).toBe(false);
  });
  it("주문 API: 대표 주소 LGU 가 있으면 동네 ID 없어도 통과", () => {
    const src = readFileSync(join(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(src).toContain("if ((!delivery_region || !delivery_city) && !hasLgu) {");
  });
});
