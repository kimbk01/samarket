"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAddressDefaultsBootRetry } from "@/lib/addresses/use-address-defaults-boot-retry";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import { isTradeBrowseLocationPath } from "@/lib/trade/location/trade-browse-location-paths";
import { writeTradeBrowseCommittedScope } from "@/lib/trade/location/trade-browse-committed-session";
import {
  buildTradeLocationHref,
  isRecoverableTradeLocationHydrateInvalid,
  parseTradeLocationScopeFromSearchParams,
  tradeLocationScopeEquals,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import { resolveTradeMarketplaceMasterAddressResetHref } from "@/lib/trade/location/trade-marketplace-master-address-reset";
import { applyMarketplaceBrowseResetClientEffects } from "@/lib/trade/marketplace/marketplace-browse-reset-client-effects";
import { resolveTradeMarketplaceMasterHydrateScope } from "@/lib/trade/location/resolve-trade-marketplace-default-city";

let sharedHydrateFlight: Promise<TradeLocationScope> | null = null;

function runSharedMarketplaceLocationHydrate(forceAddressRefresh: boolean): Promise<TradeLocationScope> {
  if (sharedHydrateFlight) return sharedHydrateFlight;
  sharedHydrateFlight = resolveTradeMarketplaceMasterHydrateScope({
    forceAddressRefresh,
  }).finally(() => {
    sharedHydrateFlight = null;
  });
  return sharedHydrateFlight;
}

function scopeNeedsMarketplaceLocationHydrate(scope: TradeLocationScope): boolean {
  return scope.mode === "unset" || isRecoverableTradeLocationHydrateInvalid(scope);
}

/**
 * Missing URL location is UNSET. Hydrate to master CITY + distance 전체 (no radius).
 * Fallback: explicit ALL when no master or master LGU map fails (47002b90e parity).
 * Recoverable invalid URLs from older builds re-seed; session pending stays UNSET.
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
  const [hydrating, setHydrating] = useState(() => scopeNeedsMarketplaceLocationHydrate(scope));
  const runIdRef = useRef(0);
  const lastCommittedScopeRef = useRef<TradeLocationScope | null>(null);
  const onLocationStack = isTradeBrowseLocationPath(pathname);
  const needsHydrate = scopeNeedsMarketplaceLocationHydrate(scope);
  const unresolved = !onLocationStack && (needsHydrate || hydrating);
  const ready =
    onLocationStack ||
    (!needsHydrate &&
      (scope.mode === "city" || scope.mode === "all" || scope.mode === "invalid"));

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
    if (!scopeNeedsMarketplaceLocationHydrate(scope)) return;

    const runId = ++runIdRef.current;
    setHydrating(true);
    try {
      const next = await runSharedMarketplaceLocationHydrate(
        isRecoverableTradeLocationHydrateInvalid(scope) || scope.mode === "unset"
      );
      if (runId !== runIdRef.current) return;

      if (next.mode === "unset") return;

      writeTradeBrowseCommittedScope(next);
      lastCommittedScopeRef.current = next;

      if (tradeLocationScopeEquals(scope, next)) return;

      const href = buildTradeLocationHref(pathname || "/market", searchKey, next);
      router.replace(href, { scroll: false });
    } finally {
      if (runId === runIdRef.current) setHydrating(false);
    }
  }, [onLocationStack, pathname, router, scope, searchKey]);

  const shouldBootRetryHydrate = useCallback(() => {
    if (onLocationStack) return false;
    if (scope.mode === "city" || scope.mode === "all") return false;
    if (!scopeNeedsMarketplaceLocationHydrate(scope)) return false;
    const last = lastCommittedScopeRef.current;
    if (!last) return true;
    return scopeNeedsMarketplaceLocationHydrate(last);
  }, [onLocationStack, scope]);

  useAddressDefaultsBootRetry(
    () => {
      void runHydrate();
    },
    shouldBootRetryHydrate
  );

  useEffect(() => {
    setHydrating(scopeNeedsMarketplaceLocationHydrate(scope));
  }, [scope]);

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
