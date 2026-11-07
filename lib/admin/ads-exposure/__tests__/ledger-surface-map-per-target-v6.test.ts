/**
 * 실기 v6 FAIL 3 (Owner 「설계안대로 진행」 2026-11-07): 위치 지도 「배달 › 업종 상단(전체) 수용 1 · 노출 중 8」.
 * 운영 DB 22:3x PHT: academy·beauty·cafe·hardware·life·mart·pet·restaurant 각 1 = 8 (업종마다 수용 1 안 · 초과 아님).
 */
import { describe, expect, it } from "vitest";
import { projectLedgerSurfaceMap } from "@/lib/admin/ads-exposure/placement-inventory";

const SLUGS = ["academy", "beauty", "cafe", "hardware", "life", "mart", "pet", "restaurant"];

describe("v6 FAIL 3 — 나뉘는 지면 합계 칸", () => {
  it("업종 8곳 × 1 → 합계 칸은 1곳당 수용량 · 비어 있음 계산 안 함 · 노출 업종 8곳", () => {
    const cells = projectLedgerSurfaceMap(
      SLUGS.map((s) => ({ locationKey: "STORES_CATEGORY_TOP", locationTarget: s, locationTargetName: s, statusTab: "live", n: 1 }))
    );
    const total = cells.find((c) => c.locationKey === "STORES_CATEGORY_TOP" && c.locationTarget == null)!;
    expect(total).toMatchObject({ capacity: 1, capacityPerTarget: true, live: 8, liveTargets: 8, vacant: null });
    for (const s of SLUGS) {
      const cell = cells.find((c) => c.locationKey === "STORES_CATEGORY_TOP" && c.locationTarget === s)!;
      expect(cell).toMatchObject({ capacity: 1, capacityPerTarget: false, live: 1, vacant: 0, liveTargets: null });
    }
  });

  it("한 업종에 2개 → 그 업종 칸만 노출 2 > 수용 1 (진짜 초과는 대상 칸에서 보인다)", () => {
    const cells = projectLedgerSurfaceMap([
      { locationKey: "STORES_CATEGORY_TOP", locationTarget: "cafe", locationTargetName: "카페", statusTab: "live", n: 2 },
      { locationKey: "STORES_CATEGORY_TOP", locationTarget: "mart", locationTargetName: "마트", statusTab: "live", n: 1 },
    ]);
    const cafe = cells.find((c) => c.locationTarget === "cafe")!;
    expect(cafe.live).toBeGreaterThan(cafe.capacity ?? 0);
    const total = cells.find((c) => c.locationKey === "STORES_CATEGORY_TOP" && c.locationTarget == null)!;
    expect(total).toMatchObject({ liveTargets: 2, live: 3, capacityPerTarget: true });
  });

  it("나뉘지 않는 지면(배달 홈 히어로)은 그대로 — 칸 수용량 · 비어 있음 계산", () => {
    const cells = projectLedgerSurfaceMap([
      { locationKey: "STORES_HOME_HERO", locationTarget: null, locationTargetName: null, statusTab: "live", n: 3 },
    ]);
    expect(cells.find((c) => c.locationKey === "STORES_HOME_HERO")).toMatchObject({
      capacity: 5,
      vacant: 2,
      capacityPerTarget: false,
      liveTargets: null,
    });
  });

  it("화면: 합계 칸은 「업종마다 수용 N」 키를 쓴다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(`${process.cwd()}/components/admin/ads/AdminAdsLedgerSurfaceMap.tsx`, "utf8");
    expect(src).toContain("c.capacityPerTarget");
    expect(src).toContain("ads_ledger_map_capacity_each_store_category");
  });
});
