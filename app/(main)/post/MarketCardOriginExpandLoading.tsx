"use client";

/**
 * `/post` segment loading fallback only.
 * Card-origin expand is owned solely by MarketCardOriginExpandOverlayHost.
 * When an origin snapshot exists, render nothing here so cold/warm nav share ONE visual owner.
 * Deep-link / refresh (no origin) keeps MainFeedRouteLoading.
 */
import { useLayoutEffect, useState } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { peekTradeMarketCardOriginExpand } from "@/lib/trade/marketplace/trade-market-card-origin-expand";

export function MarketCardOriginExpandLoading() {
  const [hasOrigin, setHasOrigin] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    setHasOrigin(Boolean(peekTradeMarketCardOriginExpand()));
  }, []);

  if (hasOrigin === null) {
    // Avoid skeleton flash before peek on first client paint.
    return (
      <div className="fixed inset-0 z-[40] bg-sam-app" data-market-card-origin-loading="pending" aria-hidden />
    );
  }

  if (hasOrigin) {
    // OverlayHost owns the expand; do not mount a second surface.
    return (
      <div className="fixed inset-0 z-[40] bg-sam-app" data-market-card-origin-loading="deferred" aria-hidden />
    );
  }

  return <MainFeedRouteLoading rows={5} />;
}
