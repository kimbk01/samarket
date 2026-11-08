/** 주소 SSOT 3단계 — 매장 위치 칸(바랑가이·시/군 PSGC)을 서버가 저장 시 결정, 표시는 칸이 기준 */
import { describe, expect, it } from "vitest";
import { computeStoreLocationColumns } from "@/lib/stores/store-location-columns.server";
import { formatStoreLocationLine, resolveStoreRegionCityLabels } from "@/lib/stores/store-location-label";

describe("매장 위치 칸", () => {
  it("Google 형식(도·시/군 + 주소 문장) → 바랑가이·PSGC", () => {
    expect(
      computeStoreLocationColumns({
        region: "Metro Manila",
        city: "Quezon City",
        address_line1: "Sct. Tuason Street, Diliman",
        formatted_address: "Sct. Tuason Street, Diliman, Quezon City, Metro Manila",
      }),
    ).toEqual({ barangay: "Diliman", canonical_lgu_id: "1381300000" });
  });

  it("오너 폼 형식(앱 동네 목록 이름) → 같은 결과", () => {
    expect(computeStoreLocationColumns({ region: "Quezon City", city: "Diliman" })).toEqual({
      barangay: "Diliman",
      canonical_lgu_id: "1381300000",
    });
  });

  it("회원 주소 연결 저장은 Google 바랑가이를 그대로", () => {
    expect(
      computeStoreLocationColumns({ region: "Metro Manila", city: "Makati City", barangayHint: "San Antonio" }),
    ).toEqual({ barangay: "San Antonio", canonical_lgu_id: "1380300000" });
  });

  it("표시는 저장된 칸이 기준 (글자 해석보다 우선)", () => {
    const row = {
      region: "Metro Manila",
      city: "Quezon City",
      address_line1: "Katipunan Ave",
      barangay: "Loyola Heights",
      canonical_lgu_id: "1381300000",
    };
    expect(formatStoreLocationLine(row)).toBe("Loyola Heights, Quezon City");
    expect(resolveStoreRegionCityLabels(row)).toEqual({ regionLabel: "Quezon City", neighborhoodLabel: "Loyola Heights" });
  });
});
