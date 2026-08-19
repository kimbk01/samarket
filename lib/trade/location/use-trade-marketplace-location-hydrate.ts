"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import { isTradeBrowseLocationPath } from "@/lib/trade/location/trade-browse-location-paths";
import { writeTradeBrowseCommittedScope } from "@/lib/trade/location/trade-browse-committed-session";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import { resolveTradeMarketplaceMasterAddressResetHref } from "@/lib/trade/location/trade-marketplace-master-address-reset";
import { applyMarketplaceBrowseResetClientEffects } from "@/lib/trade/marketplace/marketplace-browse-reset-client-effects";
import { resolveTradeMarketplaceMasterHydrateScope } from "@/lib/trade/location/resolve-trade-marketplace-default-city";

/**
 * Missing URL location is UNSET. Hydrate to master CITY + distance 전체 (no radius).
 * Fallback: explicit ALL only when no master address; LGU fail → invalid.
 * Master address change resets location + market filters to the same default.
 */
export function useTradeMarketplaceLocationHydrate(): {
  scope: TradeLocationScope;
  ready: boolean;
  unresolved: boolean;
} {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const router = useRouter();
  const scope = useMemo(
    () => parseTradeLocationScopeFromSearchParams(searchParams),
    [searchParams]
  );
  const hydratingRef = useRef(false);
  const onLocationStack = isTradeBrowseLocationPath(pathname);
  const ready = onLocationStack || scope.mode === "city" || scope.mode === "all" || scope.mode === "invalid";
  const unresolved = false;

  const runHydrate = useCallback(async () => {
    if (onLocationStack) return;

    const resetHref = await resolveTradeMarketplaceMasterAddressResetHref(
      pathname || "/market",
      searchKey
    );
    if (resetHref) {
      applyMarketplaceBrowseResetClientEffects();
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
    try {
      const next: TradeLocationScope = await resolveTradeMarketplaceMasterHydrateScope();
      writeTradeBrowseCommittedScope(next);
      const href = buildTradeLocationHref(pathname || "/market", searchKey, next);
      router.replace(href, { scroll: false });
    } finally {
      hydratingRef.current = false;
    }
  }, [onLocationStack, pathname, router, scope, searchKey]);

  useEffect(() => {
    void runHydrate();
  }, [runHydrate]);

  useEffect(() => {
    if (onLocationStack) return;
    const onAddressesUpdated = () => {
      void runHydrate();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [onLocationStack, runHydrate]);

  return { scope, ready, unresolved };
}
