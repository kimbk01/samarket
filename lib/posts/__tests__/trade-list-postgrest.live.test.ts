/**
 * LIVE (read-only) — trade list contract against the REAL Supabase PostgREST.
 *
 * Runs the production query code (resolveHomePostsPayload, fetchTradeFeedPage, search rounds,
 * page hydration) with the anon key, and checks it against an independent full read of the
 * eligible rows. No writes. Opt-in: .github/workflows/trade-list-postgrest-probe.yml
 * (`vitest run --config vitest.trade-live.config.ts`). Skipped without Supabase env.
 */
import { appendFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  hydrateHomePostsByIds,
  resolveHomePostsPayload,
  resolveHomePostsStatusOrByTradeState,
  resolveSearchExpansionRound,
  HOME_POSTS_PAGE_SIZE,
} from "@/lib/posts/home-posts-query-server";
import { fetchTradeFeedPage } from "@/lib/posts/fetch-trade-feed-page";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { PAGE_SIZE_TRADE_FEED } from "@/lib/posts/trade-posts-range-query";
import {
  classifyListingBrowseTier,
  resolveBrowseLocationTiers,
  type BrowseLocationTier,
} from "@/lib/trade/location/national/browse-location-tiers";
import {
  listingMatchesTradeFeedLocation,
  resolveTradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { listingLguDistanceKm } from "@/lib/trade/marketplace/sort-listings-by-lgu-distance";
import { loadMarketplaceSearchDiscoveryContext } from "@/lib/trade/marketplace/load-marketplace-search-discovery-context";
import {
  resetSearchRankedWindowCacheForTests,
  takeSearchRankedWindowPage,
} from "@/lib/trade/marketplace/search-ranked-window-cache";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const LIVE = Boolean(URL_ && KEY);
const SUMMARY = process.env.GITHUB_STEP_SUMMARY;

const ANCHORS = [
  ["1381300000", "Quezon City"],
  ["1380600000", "City of Manila"],
  ["0730600000", "Cebu City"],
] as const;
const RANK: Record<BrowseLocationTier, number> = { local: 0, nearby: 1, outside: 2 };
const STATUS_OR = resolveHomePostsStatusOrByTradeState("latest");

type Row = {
  id: string;
  trade_category_id: string;
  created_at: string;
  view_count: number | null;
  trade_lgu_id: string | null;
  region: string | null;
  city: string | null;
};

const report: string[] = [];
function log(line: string) {
  report.push(line);
  console.log(line);
  if (SUMMARY) appendFileSync(SUMMARY, `${line}\n`);
}

function client(key = KEY): SupabaseClient<any> {
  return createClient(URL_, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Independent ground truth: every eligible trade row, read in plain 500-row pages. */
async function readEligible(sb: SupabaseClient<any>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb
      .from(POSTS_TABLE_READ)
      .select("id,created_at,view_count,trade_lgu_id,region,city,status,trade_category_id")
      .or(STATUS_OR)
      .not("trade_category_id", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + 499);
    if (error) throw new Error(`ground truth read failed: ${error.message}`);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 500) return out;
  }
}

async function allPages(
  fetchPage: (from: number) => Promise<{ posts: { id: string }[]; hasMore: boolean } | null>,
  pageSize: number
): Promise<string[]> {
  const ids: string[] = [];
  for (let p = 0; p < 200; p++) {
    const res = await fetchPage(p * pageSize);
    if (!res) throw new Error("page query failed (null)");
    ids.push(...res.posts.map((x) => String(x.id)));
    if (!res.hasMore) return ids;
  }
  throw new Error("pagination did not terminate");
}

function compress(seq: string): string {
  return seq.replace(/(.)\1*/g, (m) => `${m[0]}${m.length}`);
}

describe.skipIf(!LIVE)("LIVE trade list — real Supabase PostgREST (read-only)", () => {
  it("browse / search / filters / errors hold the trade list contract on live data", async () => {
    const sb = client();
    const eligible = await readEligible(sb);
    const byId = new Map(eligible.map((r) => [r.id, r]));
    const eligibleIds = new Set(eligible.map((r) => r.id));
    const nullLoc = eligible.filter((r) => !r.trade_lgu_id && !(r.region && r.city));
    log(`### Live trade list probe`);
    log(`eligible rows (ground truth): ${eligible.length}; rows without resolvable location: ${nullLoc.length}`);
    expect(eligible.length).toBeGreaterThan(0);

    // 1) guest / no address: location=all → nationwide newest, complete, no dup
    const all = await allPages(
      (f) => resolveHomePostsPayload(sb, null, f, "latest", "trade", null, STATUS_OR, null, null, {}),
      HOME_POSTS_PAGE_SIZE
    );
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(eligible.map((r) => r.id));
    log(`PASS location=all latest: ${all.length} rows, newest order, dup 0, missing 0`);

    // 2) anchor + 거리 전체: LOCAL → NEARBY → NATIONWIDE, every sort, complete
    for (const [anchor, label] of ANCHORS) {
      const tiers = resolveBrowseLocationTiers(resolveTradeFeedLocationConstraint(anchor, null))!;
      for (const sort of ["latest", "popular", "distance"] as const) {
        const ids = await allPages(
          (f) => resolveHomePostsPayload(sb, null, f, sort, "trade", null, STATUS_OR, anchor, null, {}),
          HOME_POSTS_PAGE_SIZE
        );
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(ids)).toEqual(eligibleIds);
        const seq = ids.map((id) => classifyListingBrowseTier(byId.get(id)!, tiers));
        seq.forEach((t, i) => {
          if (i > 0) expect(RANK[seq[i - 1]] <= RANK[t]).toBe(true);
        });
        for (let i = 1; i < ids.length; i++) {
          if (seq[i] !== seq[i - 1]) continue;
          const a = byId.get(ids[i - 1])!;
          const b = byId.get(ids[i])!;
          if (sort === "latest") expect(a.created_at >= b.created_at).toBe(true);
          if (sort === "popular") expect(Number(a.view_count ?? 0) >= Number(b.view_count ?? 0)).toBe(true);
          if (sort === "distance") {
            expect(listingLguDistanceKm(a, anchor) <= listingLguDistanceKm(b, anchor)).toBe(true);
          }
        }
        for (const r of nullLoc) expect(seq[ids.indexOf(r.id)]).toBe("outside");
        log(
          `PASS ${label} 전체 ${sort}: ${ids.length} rows, tiers ${compress(seq.map((t) => t[0].toUpperCase()).join(""))}, dup 0, missing 0`
        );
      }
    }

    // 3) explicit radius = hard boundary
    const r5 = resolveTradeFeedLocationConstraint("1381300000", 5);
    if (r5.kind !== "lgu") throw new Error("radius constraint");
    const inside = await allPages(
      (f) => resolveHomePostsPayload(sb, null, f, "latest", "trade", null, STATUS_OR, "1381300000", 5, {}),
      HOME_POSTS_PAGE_SIZE
    );
    expect(inside).toEqual(eligible.filter((r) => listingMatchesTradeFeedLocation(r, r5)).map((r) => r.id));
    log(`PASS Quezon City radius=5: ${inside.length} rows, all inside, newest order`);

    // 4) /api/trade/feed: popular kept, tiers
    const feedIds = await allPages(
      async (f) =>
        fetchTradeFeedPage(sb, [...new Set(eligible.map((r) => r.trade_category_id))], {
          page: f / PAGE_SIZE_TRADE_FEED + 1,
          sort: "popular",
          lguCityId: "1381300000",
          statusOr: STATUS_OR,
        }),
      PAGE_SIZE_TRADE_FEED
    );
    expect(new Set(feedIds)).toEqual(eligibleIds);
    log(`PASS /api/trade/feed Quezon City 전체 popular: ${feedIds.length} rows, dup 0, missing 0`);

    // 5) search: candidate path ≡ full-pool ranking, complete, every query/sort
    for (const q of ["임대", "판매", "중고", "toyota", "selling", "condo"]) {
      const disc = await loadMarketplaceSearchDiscoveryContext(sb, null, q, null);
      for (const sort of ["latest", "popular", "distance"] as const) {
        const run = async (mode: "candidate" | "fullpool") => {
          resetSearchRankedWindowCacheForTests();
          const ids: string[] = [];
          let firstMode = "";
          for (let page = 1; page <= 200; page++) {
            const res = await takeSearchRankedWindowPage({
              key: `live-${mode}`,
              page,
              pageSize: HOME_POSTS_PAGE_SIZE,
              loadNext: async (c) => {
                const r = await resolveSearchExpansionRound(
                  sb, null, sort, "trade", null, STATUS_OR, "1381300000", null,
                  { q, searchDiscoveryContext: disc },
                  mode === "fullpool" ? { ...c, searchMode: c.searchMode ?? "fullpool" } : c
                );
                if (!firstMode && r) firstMode = String(r.cursor.searchMode);
                return r;
              },
            });
            if (!res) throw new Error(`search ${q} ${mode} failed`);
            ids.push(...res.posts.map((p) => String(p.id)));
            if (!res.hasMore) break;
          }
          return { ids, firstMode };
        };
        const cand = await run("candidate");
        const full = await run("fullpool");
        expect(new Set(cand.ids).size).toBe(cand.ids.length);
        expect(new Set(cand.ids)).toEqual(eligibleIds);
        expect(cand.ids).toEqual(full.ids);
        if (sort === "latest") {
          log(`PASS search 「${q}」: mode ${cand.firstMode}, ${cand.ids.length} rows, candidate ≡ full-pool (latest/popular/distance), dup 0, missing 0`);
        }
      }
    }

    // 6) page hydration: full rows, ranked order
    const sampleIds = eligible.slice(0, 50).map((r) => r.id).reverse();
    const hydrated = await hydrateHomePostsByIds(sb, null, sampleIds);
    expect(hydrated?.map((p) => p.id)).toEqual(sampleIds);
    log(`PASS hydrateHomePostsByIds: ${hydrated?.length} full rows in ranked order`);

    // 7) real PostgREST error → null (route answers 503), never an empty list
    const broken = client(`${KEY}x`);
    const failed = await resolveHomePostsPayload(broken, null, 0, "latest", "trade", null, STATUS_OR, "1381300000", null, {});
    expect(failed).toBeNull();
    const failedFeed = await fetchTradeFeedPage(broken, ["00000000-0000-4000-8000-000000000000"], {
      page: 1,
      sort: "latest",
      lguCityId: "1381300000",
      statusOr: STATUS_OR,
    }).then(
      () => "resolved",
      (e: Error) => e.name
    );
    expect(failedFeed).toBe("TradeFeedQueryError");
    log(`PASS PostgREST error (invalid key): list → null (503), trade/feed → TradeFeedQueryError`);
  });
});
