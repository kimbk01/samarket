/** 주소 SSOT (2026-11-09): 캠페인 지역 대상 = 대표 주소 시/군 LGU (profiles.region_code 미사용) */
import { describe, expect, it } from "vitest";
import { fetchCampaignProfileScanSlice, countCampaignTargetMembers } from "@/lib/admin/notification-campaigns/campaign-target-scan";

function fakeSvc(log: Array<{ table: string; filters: Array<[string, unknown]> }>, rows: Array<{ user_id: string }>) {
  return {
    from(table: string) {
      const entry = { table, filters: [] as Array<[string, unknown]> };
      log.push(entry);
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain,
        order: chain,
        limit: chain,
        gt: (k: string, v: unknown) => (entry.filters.push([`gt:${k}`, v]), q),
        gte: chain,
        eq: (k: string, v: unknown) => (entry.filters.push([k, v]), q),
        then: (res: (v: unknown) => unknown) => res({ data: rows, error: null, count: rows.length }),
      });
      return q;
    },
  } as never;
}

describe("캠페인 지역 대상 = 대표 주소 시/군 LGU", () => {
  it("user_addresses 의 활성 대표 주소 canonical_lgu_id 로 고른다", async () => {
    const log: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
    const ids = await fetchCampaignProfileScanSlice(
      fakeSvc(log, [{ user_id: "u1" }, { user_id: "u2" }]),
      { target_type: "region", segment_region_code: "1381300000" },
      null,
      100,
    );
    expect(ids).toEqual(["u1", "u2"]);
    expect(log[0]!.table).toBe("user_addresses");
    expect(log[0]!.filters).toEqual(
      expect.arrayContaining([
        ["is_active", true],
        ["is_default_master", true],
        ["canonical_lgu_id", "1381300000"],
      ]),
    );
    expect(log.some((l) => l.table === "profiles")).toBe(false);
  });

  it("지역 미선택이면 대상 0", async () => {
    const log: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
    expect(
      await fetchCampaignProfileScanSlice(fakeSvc(log, []), { target_type: "region", segment_region_code: "" }, null, 100),
    ).toEqual([]);
    expect(await countCampaignTargetMembers(fakeSvc(log, []), { target_type: "region", segment_region_code: null }, [])).toBe(0);
  });
});
