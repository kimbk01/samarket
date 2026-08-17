"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isTradeBrowseLocationPath } from "@/lib/trade/location/trade-browse-location-paths";
import {
  peekTradeBrowseCommittedScope,
  writeTradeBrowseCommittedScope,
} from "@/lib/trade/location/trade-browse-committed-session";
import { resolveTradeMarketplaceDefaultCityFromMaster } from "@/lib/trade/location/resolve-trade-marketplace-default-city";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";

let masterCityFlight: Promise<Extract<TradeLocationScope, { mode: "city" }> | null> | null = null;

function resolveDefaultCityShared(): Promise<Extract<TradeLocationScope, { mode: "city" }> | null> {
  if (!masterCityFlight) {
    masterCityFlight = resolveTradeMarketplaceDefaultCityFromMaster().finally(() => {
      masterCityFlight = null;
    });
  }
  return masterCityFlight;
}

/**
 * Missing URL location is UNSET. Hydrate to last committed CITY/ALL, else Address master CITY.
 * Does not fetch a nationwide feed. Location picker stack is left alone.
 */
export function useTradeMarketplaceLocationHydrate(): {
  scope: TradeLocationScope;
  ready: boolean;
  unresolved: boolean;
} {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const scope = useMemo(
    () => parseTradeLocationScopeFromSearchParams(searchParams),
    [searchParams]
  );
  const hydratingRef = useRef(false);
  const [hydrateSettled, setHydrateSettled] = useState(false);

  const onLocationStack = isTradeBrowseLocationPath(pathname);
  const ready = onLocationStack || scope.mode === "city" || scope.mode === "all" || scope.mode === "invalid";
  const unresolved = !onLocationStack && scope.mode === "unset" && hydrateSettled;

  useEffect(() => {
    if (onLocationStack) {
      setHydrateSettled(true);
      return;
    }
    if (scope.mode === "city" || scope.mode === "all") {
      writeTradeBrowseCommittedScope(scope);
      setHydrateSettled(true);
      return;
    }
    if (scope.mode !== "unset") {
      setHydrateSettled(true);
      return;
    }
    if (hydratingRef.current) return;
    hydratingRef.current = true;

    const commit = (next: TradeLocationScope) => {
      writeTradeBrowseCommittedScope(next);
      const href = buildTradeLocationHref(pathname || "/market", searchParams.toString(), next);
      router.replace(href, { scroll: false });
    };

    const session = peekTradeBrowseCommittedScope();
    if (session && (session.mode === "city" || session.mode === "all")) {
      commit(session);
      hydratingRef.current = false;
      setHydrateSettled(true);
      return;
    }

    let cancelled = false;
    void resolveDefaultCityShared().then((city) => {
      if (cancelled) return;
      if (city) commit(city);
      hydratingRef.current = false;
      setHydrateSettled(true);
    });

    return () => {
      cancelled = true;
    };
  }, [onLocationStack, pathname, router, scope, searchParams]);

  return { scope, ready, unresolved };
}
