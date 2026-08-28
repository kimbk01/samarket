"use client";

import { Suspense, useLayoutEffect, useMemo } from "react";
import { CommerceCartHubHeaderRight } from "@/components/layout/CommerceCartHubHeaderRight";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";

/** Registers hub tier1 right slot only — static chrome is resolveMainTier1Subpage SSOT. */
function CommerceHubChromeSyncInner() {
  const setExtras = useSetMainTier1ExtrasOptional();

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
    setExtras({ tier1: { rightSlot } });
    return () => setExtras(null);
  }, [setExtras, rightSlot]);

  return null;
}

export function CommerceHubChromeSyncGate() {
  return (
    <Suspense fallback={null}>
      <CommerceHubChromeSyncInner />
    </Suspense>
  );
}
