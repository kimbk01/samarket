import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  countPendingNewHomeListings,
  patchHomeTradePostsInPlace,
} from "@/lib/trade/marketplace/home-list-freshness";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("CUT H — pending N is actual unseen incoming ids", () => {
  it("counts 3 / 7 / 18 without a cap of 7", () => {
    const current = [{ id: "a" }, { id: "b" }];
    expect(countPendingNewHomeListings(current, [{ id: "n1" }, { id: "n2" }, { id: "n3" }])).toBe(3);
    expect(
      countPendingNewHomeListings(
        current,
        Array.from({ length: 7 }, (_, i) => ({ id: `n${i}` }))
      )
    ).toBe(7);
    expect(
      countPendingNewHomeListings(
        current,
        Array.from({ length: 18 }, (_, i) => ({ id: `n${i}` }))
      )
    ).toBe(18);
  });

  it("counts duplicate incoming ids once (pin overlap)", () => {
    expect(
      countPendingNewHomeListings([{ id: "a" }], [{ id: "n1" }, { id: "n1" }, { id: "a" }, { id: "n1" }])
    ).toBe(1);
  });

  it("does not count ids that left page-1 (sold/hidden drop)", () => {
    expect(
      countPendingNewHomeListings([{ id: "a" }, { id: "gone" }], [{ id: "a" }, { id: "b" }])
    ).toBe(1);
  });

  it("repeated compare is absolute, not cumulative", () => {
    const current = [{ id: "a" }];
    const incoming = [{ id: "n1" }, { id: "n2" }];
    expect(countPendingNewHomeListings(current, incoming)).toBe(2);
    expect(countPendingNewHomeListings(current, incoming)).toBe(2);
  });

  it("in-place patch does not unshift or drop rows", () => {
    const prev = [
      { id: "a", title: "old-a" },
      { id: "b", title: "old-b" },
    ];
    const incoming = [
      { id: "n", title: "new" },
      { id: "a", title: "new-a" },
      { id: "b", title: "old-b" },
    ];
    const next = patchHomeTradePostsInPlace(prev, incoming, (x, y) => x.title === y.title);
    expect(next.map((r) => r.id)).toEqual(["a", "b"]);
    expect(next[0]?.title).toBe("new-a");
    expect(next[1]?.title).toBe("old-b");
  });
});

describe("CUT H — surface contract", () => {
  it("HOME silent refresh uses pending count + in-place patch, not incoming replace", () => {
    const src = readRepoFile("components/home/HomeProductList.tsx");
    expect(src).toContain("countPendingNewHomeListings");
    expect(src).toContain("patchHomeTradePostsInPlace");
    expect(src).toContain("refreshSilent");
    expect(src).not.toMatch(/Math\.min\([^)]*,\s*7\s*\)/);
    expect(src).toMatch(/setPosts\(\(prev\) => patchHomeTradePostsInPlace/);
    expect(src).toMatch(/silentRequestIdRef\.current \+= 1/);
    const loadIdx = src.indexOf("const load = useCallback");
    const silentIdx = src.indexOf("const refreshSilent = useCallback");
    const loadSlice = src.slice(loadIdx, silentIdx);
    expect(loadSlice).toContain("silentRequestIdRef.current += 1");
  });

  it("CATEGORY browse has no silent incoming-order path and is out of H CTA", () => {
    const src = readRepoFile("components/post/PostListByCategory.tsx");
    expect(src).not.toContain("refreshSilent");
    expect(src).not.toContain("countPendingNewHomeListings");
    expect(src).not.toContain("trade_market_new_listings_cta");
  });

  it("does not add Realtime or bumped_at LIST order", () => {
    const home = readRepoFile("components/home/HomeProductList.tsx");
    const helper = readRepoFile("lib/trade/marketplace/home-list-freshness.ts");
    expect(home).not.toMatch(/supabase\.channel|realtime/i);
    expect(helper).not.toContain("bumped_at");
    expect(home).not.toContain("bumped_at");
  });
});
