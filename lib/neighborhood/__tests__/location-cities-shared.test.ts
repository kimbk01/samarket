import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 공유 캐시 흉내 — vi.fn 의 거부(reject) 결과는 vitest 가 시험 오류로 따로 보고하므로 일반 함수로 둔다 */
const shared: { impl: (() => Promise<unknown>) | null; calls: number } = { impl: null, calls: 0 };
vi.mock("@/lib/neighborhood/philife-feed-shared-config-cache.server", () => ({
  loadNeighborhoodLocationRowsShared: () => {
    shared.calls += 1;
    return shared.impl ? shared.impl() : Promise.resolve([]);
  },
}));

import { loadLocationCitiesByIdsShared } from "@/lib/neighborhood/location-cities-shared.server";
import { loadLocationCitiesByIds } from "@/lib/addresses/community-public-region-label";

/** `from("locations").select().in("id", ids)` 흉내 — 호출을 기록하고 정해진 행 중 요청 id 만 돌려준다 */
function fakeSb(rows: { id: string; city: string | null; name: string | null }[]) {
  const calls: string[][] = [];
  const sb = {
    from: (table: string) => {
      expect(table).toBe("locations");
      return {
        select: () => ({
          in: async (_col: string, ids: string[]) => {
            calls.push(ids);
            return { data: rows.filter((r) => ids.includes(r.id)), error: null };
          },
        }),
      };
    },
  };
  return { sb: sb as never, calls };
}

const ROWS = [
  { id: "loc-a", city: "Metro Manila", name: "Makati" },
  { id: "loc-b", city: "Cebu", name: "Cebu City" },
  { id: "loc-c", city: "Metro Manila", name: "Taguig" },
];

/**
 * 감사 2026-11-24 §2-2 — 동네 피드 지역 이름: 공유 캐시 행으로 (페이지마다 locations 직접 조회 1번 제거).
 */
describe("loadLocationCitiesByIdsShared", () => {
  beforeEach(() => {
    shared.impl = null;
    shared.calls = 0;
  });

  it("all ids in the shared rows → no direct locations query, same names as the direct lookup", async () => {
    shared.impl = async () => ROWS;
    const direct = fakeSb(ROWS);
    const expected = await loadLocationCitiesByIds(direct.sb, ["loc-a", "loc-b"]);

    const { sb, calls } = fakeSb(ROWS);
    const got = await loadLocationCitiesByIdsShared(sb, ["loc-a", "loc-b", "loc-a", ""]);
    expect(calls).toEqual([]);
    expect([...got.entries()].sort()).toEqual([...expected.entries()].sort());
    expect(got.size).toBe(2);
  });

  it("an id missing from the shared rows (new area) is queried directly — only that id", async () => {
    shared.impl = async () => ROWS.slice(0, 2);
    const { sb, calls } = fakeSb(ROWS);
    const got = await loadLocationCitiesByIdsShared(sb, ["loc-a", "loc-c"]);
    expect(calls).toEqual([["loc-c"]]);
    expect(got.has("loc-a")).toBe(true);
    expect(got.has("loc-c")).toBe(true);
  });

  it("shared cache failure → the previous direct lookup", async () => {
    shared.impl = async () => {
      throw new Error("cache_down");
    };
    const { sb, calls } = fakeSb(ROWS);
    const got = await loadLocationCitiesByIdsShared(sb, ["loc-b"]);
    expect(calls).toEqual([["loc-b"]]);
    expect(got.size).toBe(1);
  });

  it("no ids → nothing read", async () => {
    const { sb, calls } = fakeSb(ROWS);
    const got = await loadLocationCitiesByIdsShared(sb, []);
    expect(shared.calls).toBe(0);
    expect(calls).toEqual([]);
    expect(got.size).toBe(0);
  });

  it("the neighborhood feed list and detail use the shared lookup (not the per-page direct query)", () => {
    const src = readFileSync(join(process.cwd(), "lib/neighborhood/queries.ts"), "utf8");
    expect(src).not.toMatch(/\bloadLocationCitiesByIds\(/);
    expect(src.match(/loadLocationCitiesByIdsShared\(/g)?.length).toBe(2);
  });
});
