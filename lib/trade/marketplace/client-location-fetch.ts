/**
 * Marketplace client fetch options from URL scope or last committed session.
 * Unset → do not fetch nationwide.
 */
import {
  parseTradeLocationScopeFromSearchParams,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import { peekTradeBrowseCommittedScope } from "@/lib/trade/location/trade-browse-committed-session";
import type { GetPostsForHomeOptions } from "@/lib/posts/getPostsForHome";
import type { TradeFeedClientOptions } from "@/lib/posts/trade-feed-client-cache";

export function marketplaceLocationFetchGate(scope: TradeLocationScope): {
  canFetch: boolean;
  locationAll?: boolean;
  lguCityId?: string | null;
  radiusKm?: number | null;
} {
  if (scope.mode === "city") {
    return { canFetch: true, lguCityId: scope.lguId, radiusKm: scope.radiusKm };
  }
  if (scope.mode === "all") {
    return { canFetch: true, locationAll: true };
  }
  if (scope.mode === "invalid") {
    return { canFetch: true, lguCityId: scope.raw || "invalid", radiusKm: null };
  }
  return { canFetch: false };
}

export function marketplaceHomeFetchOptionsFromScope(
  scope: TradeLocationScope
): GetPostsForHomeOptions | null {
  const gate = marketplaceLocationFetchGate(scope);
  if (!gate.canFetch) return null;
  return {
    page: 1,
    sort: "latest",
    type: null,
    tradeState: "latest",
    locationAll: gate.locationAll === true,
    lguCityId: gate.lguCityId ?? null,
    radiusKm: gate.radiusKm ?? null,
  };
}

/** Bottom-nav / neighbor-tab prewarm — URL first, else session. Skip if still unset. */
export function marketplaceHomePrewarmOptions(
  search?: URLSearchParams | string | null
): GetPostsForHomeOptions | null {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search ??
        (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  if (params) {
    const fromUrl = marketplaceHomeFetchOptionsFromScope(
      parseTradeLocationScopeFromSearchParams(params)
    );
    if (fromUrl) return fromUrl;
  }
  const session = peekTradeBrowseCommittedScope();
  if (!session) return null;
  return marketplaceHomeFetchOptionsFromScope(session);
}

export function marketplaceFeedLocationExtras(scope: TradeLocationScope): Pick<
  TradeFeedClientOptions,
  "lguCityId" | "radiusKm" | "locationAll"
> {
  const gate = marketplaceLocationFetchGate(scope);
  return {
    locationAll: gate.locationAll === true,
    lguCityId: gate.lguCityId?.trim() || undefined,
    radiusKm: gate.radiusKm ?? undefined,
  };
}

export function marketplaceFeedLocationExtrasFromUrlOrSession(
  search?: URLSearchParams | string | null
): ReturnType<typeof marketplaceFeedLocationExtras> | null {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search ??
        (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  if (params) {
    const fromUrl = marketplaceFeedLocationExtras(parseTradeLocationScopeFromSearchParams(params));
    if (fromUrl.lguCityId || fromUrl.locationAll) return fromUrl;
  }
  const session = peekTradeBrowseCommittedScope();
  if (!session) return null;
  const fromSession = marketplaceFeedLocationExtras(session);
  if (fromSession.lguCityId || fromSession.locationAll) return fromSession;
  return null;
}
