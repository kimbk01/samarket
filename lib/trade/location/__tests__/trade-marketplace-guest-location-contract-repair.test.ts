import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { resetAppBootStore, setAppBootAnonymous, setAppBootProfile } from "@/lib/app-boot/app-boot-store";
import {
  establishGuestAuthState,
  establishRecoverableGuestAuthState,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";
import {
  canCommitTradeGuestNationwideAllFromAddressDefaults,
  tradeMarketplaceHydrateScopeBeforeMasterResolution,
} from "@/lib/trade/location/trade-marketplace-address-defaults-hydrate-scope";
import {
  consumeTradeMarketplaceGuestAllAfterAuthExit,
  consumeTradeMarketplaceMemberBrowseReseed,
  isTradeMarketplaceGuestAllAfterAuthExitPending,
  isTradeMarketplaceMemberBrowseReseedPending,
  markTradeMarketplaceGuestAllAfterAuthExit,
  markTradeMarketplaceMemberBrowseReseed,
  resetTradeMarketplaceAuthTransitionBrowseForTests,
} from "@/lib/trade/location/trade-marketplace-auth-transition-browse";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
} from "@/lib/trade/location/trade-location-scope";
import {
  buildMarketFilterDraftHref,
  marketplaceBrowseStateToGetPostsForHomeOptions,
  parseMarketplaceBrowseStateFromSearchParams,
} from "@/lib/trade/marketplace/marketplace-browse-state";

const root = resolve(__dirname, "../../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

function snapshot(partial: Partial<AddressDefaultsSnapshot>): AddressDefaultsSnapshot {
  return {
    ok: partial.ok ?? false,
    status: partial.status ?? 500,
    defaults: partial.defaults ?? null,
    neighborhoodFromLife: partial.neighborhoodFromLife ?? null,
  };
}

const UNAUTH = snapshot({ ok: false, status: 401, defaults: null });

describe("marketplace guest location contract repair", () => {
  beforeEach(() => {
    resetAppBootStore();
    resetGuestAuthStateForTests();
    resetTradeMarketplaceAuthTransitionBrowseForTests();
  });

  it("G1 — already anonymous before hydrate → ALL", () => {
    setAppBootAnonymous();
    expect(tradeMarketplaceHydrateScopeBeforeMasterResolution(UNAUTH)).toEqual({ mode: "all" });
  });

  it("G2 — UNSET first (recoverable), then anonymous → ALL via same SSOT", () => {
    establishRecoverableGuestAuthState("test:boot-race");
    expect(tradeMarketplaceHydrateScopeBeforeMasterResolution(UNAUTH)).toEqual({ mode: "unset" });
    expect(canCommitTradeGuestNationwideAllFromAddressDefaults(UNAUTH)).toBe(false);

    resetGuestAuthStateForTests();
    establishGuestAuthState("test:terminal");
    setAppBootAnonymous();
    expect(canCommitTradeGuestNationwideAllFromAddressDefaults(UNAUTH)).toBe(true);
    expect(tradeMarketplaceHydrateScopeBeforeMasterResolution(UNAUTH)).toEqual({ mode: "all" });

    const href = buildTradeLocationHref("/market", "", { mode: "all" });
    expect(href).toBe("/market?location=all");
    const opts = marketplaceBrowseStateToGetPostsForHomeOptions(
      parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams("location=all"))
    );
    expect(opts.locationAll).toBe(true);
    expect(opts.lguCityId).toBeNull();
  });

  it("G2 wiring — boot retry accepts anonymous; hydrate retries auth-transition pending", () => {
    const bootRetry = read("lib/addresses/use-address-defaults-boot-retry.ts");
    expect(bootRetry).toContain('boot.status === "anonymous"');
    expect(bootRetry).toContain("guestAnonymousReady");

    const hydrate = read("lib/trade/location/use-trade-marketplace-location-hydrate.ts");
    expect(hydrate).toContain("isTradeMarketplaceGuestAllAfterAuthExitPending");
    expect(hydrate).toContain("isTradeMarketplaceMemberBrowseReseedPending");
    expect(hydrate).toContain("runSharedMarketplaceLocationHydrate");
    expect(hydrate).not.toContain("setTimeout");
  });

  it("G3 — location=all stays fetchable nationwide", () => {
    const scope = parseTradeLocationScopeFromSearchParams(new URLSearchParams("location=all"));
    expect(scope).toEqual({ mode: "all" });
    const opts = marketplaceBrowseStateToGetPostsForHomeOptions(
      parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams("location=all"))
    );
    expect(opts.locationAll).toBe(true);
  });

  it("G4 — logout marks guest-all; CITY URL must re-resolve through SSOT (not silent keep)", () => {
    markTradeMarketplaceGuestAllAfterAuthExit();
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(true);

    setAppBootAnonymous();
    establishGuestAuthState("logout");
    const next = tradeMarketplaceHydrateScopeBeforeMasterResolution(UNAUTH);
    expect(next).toEqual({ mode: "all" });
    consumeTradeMarketplaceGuestAllAfterAuthExit();
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(false);

    const citySp = new URLSearchParams("location=city&lgu=pasig&radius=10");
    expect(parseTradeLocationScopeFromSearchParams(citySp).mode).toBe("city");
    const allHref = buildTradeLocationHref("/market", citySp.toString(), { mode: "all" });
    const allSp = new URLSearchParams(allHref.split("?")[1] ?? "");
    expect(allSp.get("location")).toBe("all");
    expect(allSp.get("lgu")).toBeNull();
    expect(allSp.get("radius")).toBeNull();
  });

  it("L1/L2 — member reseed pending forces master resolve path (CITY or ALL)", () => {
    markTradeMarketplaceMemberBrowseReseed();
    expect(isTradeMarketplaceMemberBrowseReseedPending()).toBe(true);
    expect(isTradeMarketplaceGuestAllAfterAuthExitPending()).toBe(false);

    // no master on ok snapshot → ALL (L2 shape)
    expect(
      tradeMarketplaceHydrateScopeBeforeMasterResolution(
        snapshot({ ok: true, status: 200, defaults: { master: null } })
      )
    ).toBeNull();

    consumeTradeMarketplaceMemberBrowseReseed();
    expect(isTradeMarketplaceMemberBrowseReseedPending()).toBe(false);

    const wipe = read("lib/auth/client-session-wipe.ts");
    expect(wipe).toContain("markTradeMarketplaceGuestAllAfterAuthExit");
    expect(wipe).toContain("markTradeMarketplaceMemberBrowseReseed");
  });

  it("L3 — CITY URL parse identity stable for refresh", () => {
    const sp = new URLSearchParams("location=city&lgu=pasig");
    const a = parseMarketplaceBrowseStateFromSearchParams(sp);
    const b = parseMarketplaceBrowseStateFromSearchParams(new URLSearchParams(sp.toString()));
    expect(a.locationScope.mode).toBe("city");
    expect(b.locationScope.mode).toBe("city");
    if (a.locationScope.mode === "city" && b.locationScope.mode === "city") {
      expect(a.locationScope.canonicalId).toBe(b.locationScope.canonicalId);
    }
  });

  it("F1 — guest ALL + category → nationwide category opts", () => {
    const rootId = "50feae02-9fb9-4b59-8ab7-7e43a0f5c407";
    const opts = marketplaceBrowseStateToGetPostsForHomeOptions(
      parseMarketplaceBrowseStateFromSearchParams(
        new URLSearchParams(`location=all&category=${rootId}`)
      )
    );
    expect(opts.locationAll).toBe(true);
    expect(opts.tradeMarketParentIds).toEqual([rootId]);
  });

  it("F2 — guest ALL + price/sort → nationwide filtered opts", () => {
    const href = buildMarketFilterDraftHref({
      committedSearch: "location=all",
      knownCompositionFieldIds: [],
      rootCategory: null,
      draft: {
        sort: "popular",
        tradeState: "all",
        priceMin: "100",
        priceMax: "500",
        rootCategoryId: null,
        rootCategoryIds: [],
        topicKey: null,
        topicByRoot: {},
        filters: {},
        location: {
          regionMode: "all",
          distanceAll: true,
          radiusKm: 10,
          otherCityCanonicalId: null,
        },
      },
    });
    const sp = new URLSearchParams(href.split("?")[1] ?? "");
    expect(sp.get("location")).toBe("all");
    expect(sp.get("priceMin")).toBe("100");
    expect(sp.get("priceMax")).toBe("500");
    expect(sp.get("sort")).toBe("popular");
    const opts = marketplaceBrowseStateToGetPostsForHomeOptions(
      parseMarketplaceBrowseStateFromSearchParams(sp)
    );
    expect(opts.locationAll).toBe(true);
    expect(opts.priceMin).toBe(100);
    expect(opts.sort).toBe("popular");
  });

  it("F3 — login CITY + filters stays city-scoped", () => {
    const href = buildMarketFilterDraftHref({
      committedSearch: "location=city&lgu=pasig&radius=10",
      knownCompositionFieldIds: [],
      rootCategory: null,
      draft: {
        sort: "latest",
        tradeState: "active",
        priceMin: "50",
        priceMax: "",
        rootCategoryId: null,
        rootCategoryIds: [],
        topicKey: null,
        topicByRoot: {},
        filters: {},
        location: {
          regionMode: "commit",
          distanceAll: false,
          radiusKm: 10,
          otherCityCanonicalId: null,
        },
      },
    });
    const sp = new URLSearchParams(href.split("?")[1] ?? "");
    expect(sp.get("location")).toBe("city");
    expect(sp.get("lgu")).toBe("pasig");
    expect(sp.get("radius")).toBe("10");
    expect(sp.get("priceMin")).toBe("50");
    expect(sp.get("tradeState")).toBe("active");
  });

  it("does not blind-ALL on member ready without guest proof", () => {
    setAppBootProfile(
      {
        id: "user-1",
        nickname: "u",
      } as never,
      "ready"
    );
    expect(tradeMarketplaceHydrateScopeBeforeMasterResolution(UNAUTH)).toEqual({ mode: "unset" });
  });
});
