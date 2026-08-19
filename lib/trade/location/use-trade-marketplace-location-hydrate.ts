"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isTradeBrowseLocationPath } from "@/lib/trade/location/trade-browse-location-paths";
import { writeTradeBrowseCommittedScope } from "@/lib/trade/location/trade-browse-committed-session";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import { resolveTradeMarketplaceMasterAddressResetHref } from "@/lib/trade/location/trade-marketplace-master-address-reset";
import { resolveTradeMarketplaceDefaultCityFromMaster } from "@/lib/trade/location/resolve-trade-marketplace-default-city";

/**
 * Missing URL location is UNSET. Hydrate to master CITY + distance 전체 (no radius).
 * Fallback: explicit ALL when master address has no resolvable LGU.
 * Master address change resets location + market filters to the same default.
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
  const onLocationStack = isTradeBrowseLocationPath(pathname);
  const ready = onLocationStack || scope.mode === "city" || scope.mode === "all" || scope.mode === "invalid";
  const unresolved = false;

  useEffect(() => {
    if (onLocationStack) return;

    let cancelled = false;

    const commit = (next: TradeLocationScope) => {
      writeTradeBrowseCommittedScope(next);
      const href = buildTradeLocationHref(pathname || "/market", searchParams.toString(), next);
      router.replace(href, { scroll: false });
    };

    void (async () => {
      const resetHref = await resolveTradeMarketplaceMasterAddressResetHref(
        pathname || "/market",
        searchParams.toString()
      );
      if (cancelled) return;
      if (resetHref) {
        router.replace(resetHref, { scroll: false });
        return;
      }

      if (scope.mode === "city" || scope.mode === "all") {
        writeTradeBrowseCommittedScope(scope);
        return;
      }
      if (scope.mode !== "unset") return;
      if (hydratingRef.current) return;
      hydratingRef.current = true;
      const masterCity = await resolveTradeMarketplaceDefaultCityFromMaster();
      if (cancelled) return;
      commit(masterCity ?? { mode: "all" });
      hydratingRef.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [onLocationStack, pathname, router, scope, searchParams]);

  return { scope, ready, unresolved };
}
