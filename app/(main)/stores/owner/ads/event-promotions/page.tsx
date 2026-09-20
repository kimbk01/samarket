"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerEventPromotionListClient } from "@/components/business/owner/ads/OwnerEventPromotionListClient";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

function OwnerEventPromotionListInner() {
  const searchParams = useSearchParams();
  const preload = searchParams.get("storeId")?.trim() ?? "";
  const [storeId, setStoreId] = useState(preload);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preload) {
      setStoreId(preload);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/stores", { credentials: "same-origin" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          stores?: Array<{ id?: string }>;
        };
        if (cancelled) return;
        const first = json.stores?.[0]?.id;
        if (first) setStoreId(String(first));
        else setError("no_store");
      } catch {
        if (!cancelled) setError("load_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preload]);

  if (error) {
    return <p className="p-4 text-sm text-sam-muted">{error}</p>;
  }
  if (!storeId) {
    return <OwnerStoreSuspenseFallback className="p-4 text-sm text-sam-muted" />;
  }
  return <OwnerEventPromotionListClient storeId={storeId} />;
}

export default function OwnerEventPromotionsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <OwnerEventPromotionListInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
