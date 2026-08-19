"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isTradeBrowseLocationPath } from "@/lib/trade/location/trade-browse-location-paths";
import {
  writeTradeBrowseCommittedScope,
} from "@/lib/trade/location/trade-browse-committed-session";
import {
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";

/**
 * Missing URL location is UNSET. Hydrate to explicit ALL by default.
 * Header still shows master-address place label independently.
 * Location picker stack is left alone.
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
    if (onLocationStack) {
      return;
    }
    if (scope.mode === "city" || scope.mode === "all") {
      writeTradeBrowseCommittedScope(scope);
      return;
    }
    if (scope.mode !== "unset") {
      return;
    }
    if (hydratingRef.current) return;
    hydratingRef.current = true;

    const commit = (next: TradeLocationScope) => {
      writeTradeBrowseCommittedScope(next);
      const href = buildTradeLocationHref(pathname || "/market", searchParams.toString(), next);
      router.replace(href, { scroll: false });
    };

    commit({ mode: "all" });
    hydratingRef.current = false;
    return;
  }, [onLocationStack, pathname, router, scope, searchParams]);

  return { scope, ready, unresolved };
}
