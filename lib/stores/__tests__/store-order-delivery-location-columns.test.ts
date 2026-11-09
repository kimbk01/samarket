/** 주소 SSOT: 주문 기록 배달지 위치 칸 — 주문 생성 함수는 그대로, 생성 뒤 같은 행에 위치 칸만 기록 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import {
  addressDisplayPartsFromUserAddress,
  formatAddressPublicArea,
  formatBarangayLabel,
} from "@/lib/addresses/address-display-levels";

describe("주문 배달지 위치 칸", () => {
  it("대표 주소 → 바랑가이·시/군 이름·PSGC", () => {
    const master = rowToUserAddressDTO({
      id: "m",
      is_default_master: true,
      barangay: "Barangay Diliman",
      city_municipality: "Quezon City",
      canonical_lgu_id: "1381300000",
    });
    const p = addressDisplayPartsFromUserAddress(master);
    expect(formatBarangayLabel(p?.barangay)).toBe("Diliman");
    expect(formatAddressPublicArea(p)).toBe("Quezon City");
  });

  it("API: 생성 뒤 같은 행 UPDATE(위치 칸만), 재요청(idempotent)에는 쓰지 않음, RPC payload 에 넣지 않음", () => {
    const src = readFileSync(join(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(src).toMatch(/update\(deliveryLocationColumns\)\.eq\("id", orderId\)/);
    expect(src).toContain("deliveryLocationColumns && !atomic.idempotent");
    expect(src).not.toMatch(/delivery_lgu_id:\s*deliveryLocationSnapshot/);
  });
});
