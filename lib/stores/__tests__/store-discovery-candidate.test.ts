import { describe, expect, it } from "vitest";
import {
  fetchDiscoveryCandidatePages,
  resolveStoreDiscoveryRankingCandidateRows,
  selectBrowseStoreRowsForRanking,
  STORE_DISCOVERY_CANDIDATE_PAGE_SIZE,
  STORE_HOME_FEED_RESPONSE_MAX,
  type StoreDiscoveryCandidateLoadResult,
} from "@/lib/stores/store-discovery-candidate";
import { sortStoreDiscoveryRecommendedRows } from "@/lib/stores/store-discovery-recommended-ranking";
import type { StoreBrowseRow } from "@/lib/stores/stores-browse-build";

describe("store-discovery-candidate CUT1", () => {
  it("pagination: fetches beyond PostgREST single-page cap", async () => {
    const total = STORE_DISCOVERY_CANDIDATE_PAGE_SIZE + 250;
    const allIds = Array.from({ length: total }, (_, i) => `store-${i + 1}`);

    const result = await fetchDiscoveryCandidatePages<string>(async (from, to) => {
      const batch = allIds.slice(from, to + 1);
      return { data: batch, error: null };
    });

    expect(result.status).toBe("ok");
    expect(result.pagesFetched).toBe(2);
    expect(result.rows.length).toBe(total);
    expect(result.rows[0]).toBe("store-1");
    expect(result.rows[total - 1]).toBe(`store-${total}`);
  });

  it("pagination: 1501 stores across four pages (terminal short page)", async () => {
    const total = STORE_DISCOVERY_CANDIDATE_PAGE_SIZE * 3 + 1;
    const all = Array.from({ length: total }, (_, i) => i);

    const result = await fetchDiscoveryCandidatePages<number>(async (from, to) => {
      return { data: all.slice(from, to + 1), error: null };
    });

    expect(result.status).toBe("ok");
    expect(result.pagesFetched).toBe(4);
    expect(result.rows.length).toBe(total);
  });

  it("snapshot fallback is never ranking authority when direct ok+empty", () => {
    const directOkEmpty: StoreDiscoveryCandidateLoadResult<StoreBrowseRow> = {
      status: "ok",
      rows: [],
      pagesFetched: 1,
    };
    const snapshotCapped = Array.from({ length: 120 }, (_, i) => ({
      id: `snap-${i}`,
      slug: `snap-${i}`,
    })) as StoreBrowseRow[];

    expect(selectBrowseStoreRowsForRanking(directOkEmpty, snapshotCapped)).toEqual([]);
    expect(resolveStoreDiscoveryRankingCandidateRows(directOkEmpty)).toEqual([]);
  });

  it("snapshot fallback is never ranking authority when direct errors", () => {
    const directError: StoreDiscoveryCandidateLoadResult<StoreBrowseRow> = {
      status: "error",
      rows: [],
      pagesFetched: 1,
    };
    const snapshotCapped = Array.from({ length: 120 }, (_, i) => ({
      id: `snap-${i}`,
      slug: `snap-${i}`,
    })) as StoreBrowseRow[];

    expect(selectBrowseStoreRowsForRanking(directError, snapshotCapped)).toEqual([]);
  });

  it("pre-rank cap removed: store beyond 120 fetch window ranks with full candidate pool", () => {
    type RankRow = {
      id: string;
      slug: string;
      district: string | null;
      rating_avg: number | null;
      review_count: number | null;
    };

    const rows: RankRow[] = Array.from({ length: 150 }, (_, i) => ({
      id: `s${i + 1}`,
      slug: `s${i + 1}`,
      district: null,
      rating_avg: 4,
      review_count: 1,
    }));

    const ctx = {
      district: null,
      eligibilityRankById: new Map(rows.map((r) => [r.id, 0])),
      distanceKmById: new Map(rows.map((r) => [r.id, 1])),
      outOfRangeById: new Map(rows.map((r) => [r.id, false])),
      hasGeo: true,
      completedOrderCount30dById: new Map<string, number>([["s150", 100]]),
      completedOrderCountStatus: "ok" as const,
    };

    const cappedPreRank = rows.slice(0, 120);
    const cappedSorted = sortStoreDiscoveryRecommendedRows(cappedPreRank, ctx);
    expect(cappedSorted.some((r) => r.id === "s150")).toBe(false);

    const fullSorted = sortStoreDiscoveryRecommendedRows(rows, ctx);
    expect(fullSorted[0]?.id).toBe("s150");
  });

  it("STORE_HOME_FEED_RESPONSE_MAX is post-rank only", () => {
    expect(STORE_HOME_FEED_RESPONSE_MAX).toBe(48);
    const postRankSlice = Array.from({ length: 150 }, (_, i) => `s${i + 1}`).slice(
      0,
      STORE_HOME_FEED_RESPONSE_MAX
    );
    expect(postRankSlice.length).toBe(48);
  });
});
