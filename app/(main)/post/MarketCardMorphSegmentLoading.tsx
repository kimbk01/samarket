"use client";

/**
 * `/post` segment loading fallback only.
 * Morph coordinator owns presentation when a session is armed.
 * Deep-link / refresh (no morph) keeps MainFeedRouteLoading.
 */
import { useLayoutEffect, useState } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { peekTradeMarketCardMorph } from "@/lib/trade/marketplace/trade-market-card-morph";

export function MarketCardMorphSegmentLoading() {
  const [hasMorph, setHasMorph] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    setHasMorph(Boolean(peekTradeMarketCardMorph()));
  }, []);

  if (hasMorph === null || hasMorph) {
    // Coordinator cover owns the frame — do not mount a second loading surface.
    return null;
  }

  return <MainFeedRouteLoading rows={5} />;
}
