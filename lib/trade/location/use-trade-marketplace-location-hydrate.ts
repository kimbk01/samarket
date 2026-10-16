"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAddressDefaultsBootRetry } from "@/lib/addresses/use-address-defaults-boot-retry";
import { peekFreshAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { pickUserAddressMasterRow } from "@/lib/addresses/user-address-master-ssot";
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
import {
  consumeTradeMarketplaceGuestAllAfterAuthExit,
  consumeTradeMarketplaceMemberBrowseReseed,
  isTradeMarketplaceGuestAllAfterAuthExitPending,
  isTradeMarketplaceMemberBrowseReseedPending,
  shouldConsumeTradeMarketplaceGuestAllAfterAuthExit,
} from "@/lib/trade/location/trade-marketplace-auth-transition-browse";
import { resolveTradeMarketplaceMasterAddressResetHref } from "@/lib/trade/location/trade-marketplace-master-address-reset";
import { applyMarketplaceBrowseResetClientEffects } from "@/lib/trade/marketplace/marketplace-browse-reset-client-effects";
import {
  resolveTradeMarketplaceMasterHydrateOutcome,
  tradeMarketplaceCityScopeFromMasterAddress,
  type TradeMarketplaceHydrateOutcome,
} from "@/lib/trade/location/resolve-trade-marketplace-default-city";
import { isAppBootReady } from "@/lib/app-boot/app-boot-store";

let sharedHydrateFlight: Promise<TradeMarketplaceHydrateOutcome> | null = null;

function runSharedMarketplaceLocationHydrate(): Promise<TradeMarketplaceHydrateOutcome> {
  if (sharedHydrateFlight) return sharedHydrateFlight;
  sharedHydrateFlight = resolveTradeMarketplaceMasterHydrateOutcome().finally(() => {
    sharedHydrateFlight = null;
  });
  return sharedHydrateFlight;
}

/**
 * Bounded retry for an UNSET hydrate that could not resolve (address API error/timeout, or
 * auth still restoring after boot already settled — no further boot event will arrive).
 * After the last attempt the hook reports `failed` (error + retry UI) — never endless loading,
 * never a fake ALL.
 */
export const TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

function peekMasterCityScopeFromAddressCache(): Extract<TradeLocationScope, { mode: "city" }> | null {
  const snapshot = peekFreshAddressDefaultsSnapshot();
  if (!snapshot?.ok) return null;
  const master = pickUserAddressMasterRow(snapshot.defaults);
  if (!master) return null;
  return tradeMarketplaceCityScopeFromMasterAddress(master);
}

function scopeNeedsMarketplaceLocationHydrate(scope: TradeLocationScope): boolean {
  return scope.mode === "unset" || isRecoverableTradeLocationHydrateInvalid(scope);
}

/**
 * /market unset → current address-book master CITY + distance 전체.
 * Do not wait on reset, session location, or ALL-first. Master id change still resets.
 * Guest: anonymous APP_BOOT_READY retries existing SSOT after early UNSET (HARD LOCK).
 * Auth transitions: logout→guest ALL; login→master CITY via same resolve path.
 */
export function useTradeMarketplaceLocationHydrate(): {
  scope: TradeLocationScope;
  ready: boolean;
  unresolved: boolean;
  /** UNSET hydrate gave up after bounded retries — show error + `retry` (not loading). */
  failed: boolean;
  retry: () => void;
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
  const [failed, setFailed] = useState(false);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runHydrateRef = useRef<() => Promise<void>>(async () => {});
  const runIdRef = useRef(0);
  const lastCommittedScopeRef = useRef<TradeLocationScope | null>(null);
  const onLocationStack = isTradeBrowseLocationPath(pathname);
  const needsHydrate = scopeNeedsMarketplaceLocationHydrate(scope);
  const unresolved = !onLocationStack && !failed && (needsHydrate || hydrating);
  const ready =
    onLocationStack ||
    (!needsHydrate &&
      (scope.mode === "city" || scope.mode === "all" || scope.mode === "invalid"));

  const commitScopeToUrl = useCallback(
    (next: TradeLocationScope, current: TradeLocationScope) => {
      writeTradeBrowseCommittedScope(next);
      lastCommittedScopeRef.current = next;
      if (tradeLocationScopeEquals(current, next)) return;
      const href = buildTradeLocationHref(pathname || "/market", searchKey, next);
      router.replace(href, { scroll: false });
    },
    [pathname, router, searchKey]
  );

  const scheduleHydrateRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    const attempt = retryAttemptRef.current;
    if (attempt >= TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS.length) {
      setFailed(true);
      return;
    }
    retryAttemptRef.current = attempt + 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void runHydrateRef.current();
    }, TRADE_MARKETPLACE_HYDRATE_RETRY_DELAYS_MS[attempt]);
  }, []);

  const runHydrate = useCallback(async () => {
    if (onLocationStack) return;

    /** Member login wins: markMember clears durable guest-exit; never apply A logout over B master. */
    const memberReseed = isTradeMarketplaceMemberBrowseReseedPending();
    const authExitGuestAll =
      !memberReseed && isTradeMarketplaceGuestAllAfterAuthExitPending();

    if (authExitGuestAll || memberReseed || scopeNeedsMarketplaceLocationHydrate(scope)) {
      const runId = ++runIdRef.current;
      setHydrating(true);
      try {
        /**
         * Auth-transition / UNSET: always re-resolve through existing SSOT.
         * Do not peek cached master CITY on guest-all exit (would re-leak member city).
         * Member reseed must not short-circuit on stale guest address cache either.
         */
        const cachedCity =
          !authExitGuestAll && !memberReseed ? peekMasterCityScopeFromAddressCache() : null;
        const outcome: TradeMarketplaceHydrateOutcome = cachedCity
          ? { kind: "resolved", scope: cachedCity }
          : await runSharedMarketplaceLocationHydrate();
        if (runId !== runIdRef.current) return;
        if (outcome.kind !== "resolved") {
          /**
           * pending_auth before boot settles → boot-ready retry (below) owns the next run.
           * transient_error, or pending_auth after boot settled → bounded timed retry, then failed.
           */
          const waitForBootEvent = outcome.kind === "pending_auth" && !isAppBootReady();
          if (!waitForBootEvent) scheduleHydrateRetry();
          return;
        }
        retryAttemptRef.current = 0;
        const next = outcome.scope;

        if (authExitGuestAll) {
          /** One-shot invalidation of leaked member CITY — target is ALL only. */
          if (!shouldConsumeTradeMarketplaceGuestAllAfterAuthExit(next)) return;
          commitScopeToUrl(next, scope);
          consumeTradeMarketplaceGuestAllAfterAuthExit();
          return;
        }

        commitScopeToUrl(next, scope);
        if (memberReseed) consumeTradeMarketplaceMemberBrowseReseed();
      } finally {
        if (runId === runIdRef.current) setHydrating(false);
      }
      return;
    }

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
    }
  }, [commitScopeToUrl, onLocationStack, pathname, router, scheduleHydrateRetry, scope, searchKey]);
  runHydrateRef.current = runHydrate;

  const retry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryAttemptRef.current = 0;
    setFailed(false);
    void runHydrateRef.current();
  }, []);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    []
  );

  const shouldBootRetryHydrate = useCallback(() => {
    if (onLocationStack) return false;
    if (isTradeMarketplaceGuestAllAfterAuthExitPending()) return true;
    if (isTradeMarketplaceMemberBrowseReseedPending()) return true;
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
    if (!scopeNeedsMarketplaceLocationHydrate(scope)) {
      retryAttemptRef.current = 0;
      setFailed(false);
    }
  }, [scope]);

  useLayoutEffect(() => {
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

  return { scope, ready, unresolved, failed: failed && !onLocationStack, retry };
}
