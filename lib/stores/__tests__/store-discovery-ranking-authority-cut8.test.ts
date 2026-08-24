import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  STORE_DISCOVERY_RANKING_AUTHORITY_DEFAULT,
  STORE_DISCOVERY_RANKING_AUTHORITY_ENV,
  isStoreDiscoveryRankingAuthorityNew,
  resolveStoreDiscoveryRankingAuthority,
} from "@/lib/stores/discovery/store-discovery-ranking-authority";

const HOME_FEED = join(process.cwd(), "app/api/stores/home-feed/route.ts");
const BROWSE_SNAPSHOT = join(process.cwd(), "lib/stores/stores-browse-snapshot.ts");
const LIVE_LOADER = join(process.cwd(), "lib/stores/discovery/load-store-discovery-ranked-live.ts");
const AUTHORITY = join(process.cwd(), "lib/stores/discovery/store-discovery-ranking-authority.ts");

const PREV = process.env[STORE_DISCOVERY_RANKING_AUTHORITY_ENV];

afterEach(() => {
  if (PREV === undefined) delete process.env[STORE_DISCOVERY_RANKING_AUTHORITY_ENV];
  else process.env[STORE_DISCOVERY_RANKING_AUTHORITY_ENV] = PREV;
});

describe("CUT 8 ranking authority switch", () => {
  it("defaults to new when env unset or garbage", () => {
    delete process.env[STORE_DISCOVERY_RANKING_AUTHORITY_ENV];
    expect(STORE_DISCOVERY_RANKING_AUTHORITY_DEFAULT).toBe("new");
    expect(resolveStoreDiscoveryRankingAuthority({})).toBe("new");
    expect(isStoreDiscoveryRankingAuthorityNew({})).toBe(true);
    expect(resolveStoreDiscoveryRankingAuthority({ [STORE_DISCOVERY_RANKING_AUTHORITY_ENV]: "nope" })).toBe(
      "new"
    );
  });

  it("rollback env=old selects OLD path", () => {
    expect(resolveStoreDiscoveryRankingAuthority({ [STORE_DISCOVERY_RANKING_AUTHORITY_ENV]: "old" })).toBe(
      "old"
    );
    expect(isStoreDiscoveryRankingAuthorityNew({ [STORE_DISCOVERY_RANKING_AUTHORITY_ENV]: "old" })).toBe(
      false
    );
    expect(resolveStoreDiscoveryRankingAuthority({ [STORE_DISCOVERY_RANKING_AUTHORITY_ENV]: "NEW" })).toBe(
      "new"
    );
  });
});

describe("CUT 8 live route fail-closed source guards", () => {
  it("home-feed fail-closes on NEW ranking miss and never falls back to candidate load", () => {
    const src = readFileSync(HOME_FEED, "utf8");
    expect(src).toContain("loadHomeDiscoveryRankedForLive");
    expect(src).toContain("isStoreDiscoveryRankingAuthorityNew");
    expect(src).toContain("discovery_ranking_unavailable");
    expect(src).toContain('status: 500');
    expect(src).toContain("ranking_authority");
    expect(src).toContain('status: "old_path"');
    // Fail-closed: NEW !ok returns before OLD candidate path
    const failIdx = src.indexOf("discovery_ranking_unavailable");
    const oldPathIdx = src.indexOf('status: "old_path"');
    expect(failIdx).toBeGreaterThan(-1);
    expect(oldPathIdx).toBeGreaterThan(failIdx);
    expect(src).toMatch(/if\s*\(\s*!live\.ok\s*\)[\s\S]*?discovery_ranking_unavailable[\s\S]*?status:\s*500/);
  });

  it("browse snapshot fail-closes with discovery_ranking_* and skips live order aggregate on NEW", () => {
    const src = readFileSync(BROWSE_SNAPSHOT, "utf8");
    expect(src).toContain("loadBrowseDiscoveryRankedForLive");
    expect(src).toContain("buildStoreDiscoveryBrowseExposureScope");
    expect(src).toContain("discovery_ranking_${live.status}");
    expect(src).toContain("ranking_authority");
    expect(src).toContain('status: "old_path"');
    expect(src).toContain("applyBrowseSubFilterContractToPrefetchedFilter");
    // NEW branch must not call completed-order aggregate; OLD may
    const newBlockMatch = src.match(
      /if\s*\(\s*isStoreDiscoveryRankingAuthorityNew\(\)\s*\)\s*\{([\s\S]*?)\}\s*else\s*\{/
    );
    expect(newBlockMatch?.[1] ?? "").not.toContain("loadStoreCompletedOrderCount30dMapWithStatus");
    expect(newBlockMatch?.[1] ?? "").toContain("applyBrowseSubFilterContractToPrefetchedFilter");
    expect(newBlockMatch?.[1] ?? "").toContain("applyNewAuthorityDistanceSortToBrowseFilter");
    expect(src).toContain("loadStoreCompletedOrderCount30dMapWithStatus");
  });

  it("live ranked loader has no live order aggregate and stays fail-closed", () => {
    const src = readFileSync(LIVE_LOADER, "utf8");
    expect(src).not.toContain("loadStoreCompletedOrderCount30dMapWithStatus");
    expect(src).not.toContain("loadHomeDiscoveryCandidateRows");
    expect(src).not.toContain("loadBrowseDiscoveryCandidateRows");
    expect(src).toContain("Fail-closed");
    expect(src).toContain("loadStoreDiscoveryHomeShadowViaRpc");
    expect(src).toContain("loadStoreDiscoveryBrowseShadowViaRpc");
  });

  it("authority module forbids request-level silent OLD fallback", () => {
    const src = readFileSync(AUTHORITY, "utf8");
    expect(src).toContain("Forbidden: request-level silent OLD fallback when NEW fails");
    expect(src).toContain('STORE_DISCOVERY_RANKING_AUTHORITY_DEFAULT: StoreDiscoveryRankingAuthority = "new"');
  });
});
