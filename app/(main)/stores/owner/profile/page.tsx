"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { OwnerStoreProfileForm } from "@/components/business/OwnerStoreProfileForm";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import {
  OwnerStorePagePhaseGate,
  type OwnerStorePagePhase,
} from "@/components/business/owner/OwnerStorePagePhaseGate";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  fetchMeStoresListDeduped,
  invalidateMeStoresListDedupedCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { refreshOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";

type Phase =
  | { kind: "loading" }
  | { kind: "need_store_id" }
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  | { kind: "ok"; row: StoreRow };

function toGatePhase(phase: Phase): OwnerStorePagePhase {
  if (phase.kind === "ok") return { kind: "ok" };
  if (phase.kind === "need_store_id") return { kind: "need_store_id", profile: true };
  return phase;
}

function MyBusinessProfilePageInner() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("storeId")?.trim() ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!storeIdParam) {
      setPhase({ kind: "need_store_id" });
      return;
    }
    setPhase({ kind: "loading" });
    try {
      const { status, json: raw } = await fetchMeStoresListDeduped();
      if (status === 401) {
        setPhase({ kind: "unauth" });
        return;
      }
      if (status === 503) {
        setPhase({ kind: "config" });
        return;
      }
      const json = raw as { ok?: boolean; stores?: StoreRow[]; error?: string };
      if (!json?.ok) {
        setPhase({
          kind: "error",
          message: typeof json?.error === "string" ? json.error : "load_failed",
        });
        return;
      }
      const stores = (json.stores ?? []) as StoreRow[];
      const row = stores.find((s) => s.id === storeIdParam);
      if (!row) {
        setPhase({ kind: "not_found" });
        return;
      }
      setPhase({ kind: "ok", row });
    } catch {
      setPhase({ kind: "error", message: "network_error" });
    }
  }, [storeIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <OwnerAdminPageScrollShell padForOwnerBottomNav={false}>
      <div className="mx-auto min-w-0 max-w-4xl py-0">
        <OwnerStorePagePhaseGate phase={toGatePhase(phase)} onRetry={() => void load()}>
          {phase.kind === "ok" ? (
            <div className={`max-w-full min-w-0 ${OWNER_STORE_STACK_Y_CLASS}`}>
              <OwnerStoreProfileForm
                storeId={phase.row.id}
                storeSlug={phase.row.slug}
                row={phase.row}
                onSaved={() => {
                  invalidateMeStoresListDedupedCache();
                  refreshOwnerLiteStore();
                  void load();
                }}
              />
            </div>
          ) : null}
        </OwnerStorePagePhaseGate>
      </div>
    </OwnerAdminPageScrollShell>
  );
}

export default function MyBusinessProfilePage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="py-4">
          <OwnerStoreSuspenseFallback />
        </OwnerAdminPageScrollShell>
      }
    >
      <MyBusinessProfilePageInner />
    </Suspense>
  );
}
