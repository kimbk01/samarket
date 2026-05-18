"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { StoreCommerceCartPageClient } from "@/components/stores/StoreCommerceCartPageClient";
import { StoreCommerceCartEntryFallback } from "@/components/stores/StoreCommerceCartEntryFallback";
import {
  fetchStorePublicBySlugDeduped,
  primeStorePublicCache,
  type StoreApiJsonResponse,
} from "@/lib/stores/store-delivery-api-client";

type EntryState =
  | { kind: "load" }
  | { kind: "real" }
  | { kind: "fallback"; hint: "network" | "missing" | "api" };

export function StoreCartEntrySwitch({
  storeSlug,
  initialVerifiedReal,
  initialApiForPrime,
}: {
  storeSlug: string;
  /** 서버 선조회로 매장 존재 확인 시 로딩 스켈레톤 생략 */
  initialVerifiedReal?: boolean;
  initialApiForPrime?: StoreApiJsonResponse | null;
}) {
  const normalizedSlug = useMemo(
    () => decodeURIComponent((storeSlug || "").trim()),
    [storeSlug]
  );

  const [state, setState] = useState<EntryState>(() =>
    initialVerifiedReal ? { kind: "real" } : { kind: "load" }
  );
  const isSameEntryState = (a: EntryState, b: EntryState): boolean => {
    if (a.kind !== b.kind) return false;
    if (a.kind === "fallback" && b.kind === "fallback") return a.hint === b.hint;
    return true;
  };

  const detect = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) {
        setState((prev) => (isSameEntryState(prev, { kind: "load" }) ? prev : { kind: "load" }));
      }
      try {
        const { json: raw } = await fetchStorePublicBySlugDeduped(normalizedSlug);
        const json = raw as { ok?: boolean; store?: unknown };
        const next = ((): EntryState => {
          if (json?.ok && json?.store) return { kind: "real" };
          if (!json?.ok) return { kind: "fallback", hint: "api" };
          return { kind: "fallback", hint: "missing" };
        })();
        if (silent) {
          setState((prev) => {
            if (next.kind === "fallback" && prev.kind === "real") {
              return prev;
            }
            return isSameEntryState(prev, next) ? prev : next;
          });
        } else {
          setState((prev) => (isSameEntryState(prev, next) ? prev : next));
        }
      } catch {
        if (!silent) {
          setState((prev) =>
            isSameEntryState(prev, { kind: "fallback", hint: "network" })
              ? prev
              : { kind: "fallback", hint: "network" }
          );
        }
      }
    },
    [normalizedSlug]
  );

  useLayoutEffect(() => {
    if (initialApiForPrime?.status === 200) {
      primeStorePublicCache(normalizedSlug, initialApiForPrime);
    }
  }, [normalizedSlug, initialApiForPrime]);

  useEffect(() => {
    /** 서버에서 이미 검증·캐시 primed — 마운트 시 중복 GET 생략(체감 속도) */
    if (initialVerifiedReal) return;
    void detect();
  }, [detect, initialVerifiedReal]);

  useRefetchOnPageShowRestore(() => void detect({ silent: true }));

  if (state.kind === "load") {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">불러오는 중…</div>
    );
  }
  if (state.kind === "real") {
    return <StoreCommerceCartPageClient storeSlug={normalizedSlug} />;
  }
  return (
    <StoreCommerceCartEntryFallback
      hint={state.hint}
      onRetry={state.hint === "network" ? () => void detect() : undefined}
    />
  );
}
