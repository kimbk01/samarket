"use client";



import { useSearchParams } from "next/navigation";

import { Suspense, useCallback, useEffect, useState } from "react";

import { OwnerStoreBasicInfoForm } from "@/components/business/OwnerStoreBasicInfoForm";

import {

  OwnerStorePagePhaseGate,

  type OwnerStorePagePhase,

} from "@/components/business/owner/OwnerStorePagePhaseGate";

import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";

import type { StoreRow } from "@/lib/stores/db-store-mapper";

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



function MyBusinessBasicInfoPageInner() {

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
      <div className="mx-auto min-w-0 max-w-4xl py-1">

          <OwnerStorePagePhaseGate phase={toGatePhase(phase)} onRetry={() => void load()}>

            {phase.kind === "ok" ? (

              <OwnerStoreBasicInfoForm

                storeId={phase.row.id}

                row={phase.row}

                onSaved={() => void load()}

              />

            ) : null}

          </OwnerStorePagePhaseGate>

      </div>
    </OwnerAdminPageScrollShell>

  );

}



export default function MyBusinessBasicInfoPage() {

  return (

    <Suspense

      fallback={

        <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-4">
          <OwnerStoreSuspenseFallback />
        </OwnerAdminPageScrollShell>

      }

    >

      <MyBusinessBasicInfoPageInner />

    </Suspense>

  );

}


