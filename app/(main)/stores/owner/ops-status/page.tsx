"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { OwnerStoreOpsStatusBody } from "@/components/business/owner/OwnerStoreOpsStatusBody";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSupportShell } from "@/components/support/OwnerStoreSupportShell";
import {
  OwnerStorePagePhaseGate,
  type OwnerStorePagePhase,
} from "@/components/business/owner/OwnerStorePagePhaseGate";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { dbStoreToBusinessProfile, type StoreRow } from "@/lib/stores/db-store-mapper";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

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
  return phase;
}

function MyBusinessOpsStatusPageInner() {
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

  const stripProps = useMemo(() => {
    if (phase.kind !== "ok") return null;
    const row = phase.row;
    const profile = dbStoreToBusinessProfile(row);
    const canSell =
      !!row.sales_permission &&
      row.sales_permission.allowed_to_sell === true &&
      row.sales_permission.sales_status === "approved";
    return { row, profile, canSell };
  }, [phase]);

  return (
    <OwnerStoreSupportShell category="STORE" sourceSurface="owner_ops_status">
    <OwnerAdminPageScrollShell>
      <div className="mx-auto min-w-0 max-w-4xl py-1">
        <OwnerStorePagePhaseGate phase={toGatePhase(phase)} onRetry={() => void load()}>
          {stripProps ? (
            <OwnerStoreOpsStatusBody
              row={stripProps.row}
              profile={stripProps.profile}
              canSell={stripProps.canSell}
            />
          ) : null}
        </OwnerStorePagePhaseGate>
      </div>
    </OwnerAdminPageScrollShell>
    </OwnerStoreSupportShell>
  );
}

export default function MyBusinessOpsStatusPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="py-4">
          <OwnerStoreSuspenseFallback />
        </OwnerAdminPageScrollShell>
      }
    >
      <MyBusinessOpsStatusPageInner />
    </Suspense>
  );
}
