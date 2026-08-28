"use client";

import { Suspense, useLayoutEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CommerceCartHubHeaderRight } from "@/components/layout/CommerceCartHubHeaderRight";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";

/** Registers hub tier1 title/back/right — tabs render via AppStickyHeader path rule (G1). */
function CommerceHubChromeSyncInner() {
  const searchParams = useSearchParams();
  const setExtras = useSetMainTier1ExtrasOptional();
  const from = searchParams.get("from")?.trim() || null;
  const backHref = "/stores";

  const rightSlot = useMemo(
    () => (
      <Suspense fallback={null}>
        <CommerceCartHubHeaderRight />
      </Suspense>
    ),
    []
  );

  useLayoutEffect(() => {
    if (!setExtras) return;
    setExtras({
      tier1: {
        titleText: "commerce_hub_title",
        backHref,
        preferHistoryBack: true,
        showHubQuickActions: false,
        rightSlot,
      },
    });
    return () => setExtras(null);
  }, [setExtras, backHref, rightSlot, from]);

  return null;
}

export function CommerceHubChromeSyncGate() {
  return (
    <Suspense fallback={null}>
      <CommerceHubChromeSyncInner />
    </Suspense>
  );
}
