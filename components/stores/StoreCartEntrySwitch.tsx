"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { markCartHydrationPageMount } from "@/lib/stores/cart-hydration-breakdown";
import { cartRenderAudit } from "@/lib/stores/cart-render-audit";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { StoreCommerceCartPageClient } from "@/components/stores/StoreCommerceCartPageClient";
import { StoreCommerceCartEntryFallback } from "@/components/stores/StoreCommerceCartEntryFallback";
import {
  fetchStorePublicBySlugDeduped,
  primeStorePublicCache,
  type StoreApiJsonResponse,
} from "@/lib/stores/store-delivery-api-client";

type EntryState =
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
  const { t } = useI18n();
  const normalizedSlug = useMemo(
    () => decodeURIComponent((storeSlug || "").trim()),
    [storeSlug]
  );

  const mountMarkedRef = useRef(false);
  useLayoutEffect(() => {
    if (mountMarkedRef.current) return;
    mountMarkedRef.current = true;
    markCartHydrationPageMount();
    cartRenderAudit("StoreCartEntrySwitch", { reason: "mount" });
  }, []);

  /** 첫 페인트: 로딩 전체 화면 대신 클라 cart shell — 백그라운드 detect 만 fallback 갱신 */
  const [state, setState] = useState<EntryState>(() => ({ kind: "real" }));
  const isSameEntryState = (a: EntryState, b: EntryState): boolean => {
    if (a.kind !== b.kind) return false;
    if (a.kind === "fallback" && b.kind === "fallback") return a.hint === b.hint;
    return true;
  };

  const detect = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      /* silent 백그라운드 검증 — 첫 cart shell 은 항상 real 유지 */
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
    if (initialApiForPrime?.status === 200) return;
    void detect({ silent: true });
  }, [detect, initialApiForPrime?.status]);

  useRefetchOnPageShowRestore(() => void detect({ silent: true }));

  if (state.kind === "real") {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <StoreCommerceCartPageClient storeSlug={normalizedSlug} />
      </div>
    );
  }
  return (
    <StoreCommerceCartEntryFallback
      hint={state.hint}
      onRetry={state.hint === "network" ? () => void detect() : undefined}
    />
  );
}
