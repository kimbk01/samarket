"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { StoreCommerceCartPageClient } from "@/components/stores/StoreCommerceCartPageClient";
import { StoreCommerceCartEntryFallback } from "@/components/stores/StoreCommerceCartEntryFallback";

type EntryState =
  | { kind: "load" }
  | { kind: "real" }
  | { kind: "fallback"; hint: "network" | "missing" | "api" };

export function StoreCartEntrySwitch({ storeSlug }: { storeSlug: string }) {
  const normalizedSlug = useMemo(
    () => decodeURIComponent((storeSlug || "").trim()),
    [storeSlug]
  );

  const [state, setState] = useState<EntryState>({ kind: "load" });

  const detect = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) {
        setState({ kind: "load" });
      }
      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(normalizedSlug)}`, {
          cache: "no-store",
        });
        const json: { ok?: boolean; store?: unknown } = await res.json().catch(() => ({}));
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
            return next;
          });
        } else {
          setState(next);
        }
      } catch {
        if (!silent) setState({ kind: "fallback", hint: "network" });
      }
    },
    [normalizedSlug]
  );

  useEffect(() => {
    void detect();
  }, [detect]);

  useRefetchOnPageShowRestore(() => void detect({ silent: true }));

  if (state.kind === "load") {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center text-[14px] text-sam-muted">불러오는 중…</div>
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
