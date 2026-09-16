"use client";

/**
 * Continuity surface for Marketplace card→detail while RSC resolves.
 * Replaces CommunityFeedSkeleton flash when a captured card origin exists.
 * Deep-link / refresh (no origin) keeps the existing feed loading shell.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import {
  peekTradeMarketCardOriginExpand,
  tradeMarketCardOriginExpandTransform,
  type TradeMarketCardOriginExpand,
} from "@/lib/trade/marketplace/trade-market-card-origin-expand";

const EXPAND_MS = 320;

export function MarketCardOriginExpandLoading() {
  const [origin, setOrigin] = useState<TradeMarketCardOriginExpand | null | undefined>(undefined);

  useLayoutEffect(() => {
    setOrigin(peekTradeMarketCardOriginExpand());
  }, []);

  if (origin === undefined) {
    // First client paint — avoid skeleton flash before peek.
    return (
      <div
        className="fixed inset-0 z-[40] bg-sam-app"
        data-market-card-origin-loading="pending"
        aria-hidden
      />
    );
  }

  if (!origin) {
    return <MainFeedRouteLoading rows={5} />;
  }

  return <MarketCardOriginExpandSurface origin={origin} />;
}

function MarketCardOriginExpandSurface({ origin }: { origin: TradeMarketCardOriginExpand }) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const t = tradeMarketCardOriginExpandTransform(origin);
    el.style.transform = `translate3d(${t.translateX}px, ${t.translateY}px, 0) scale(${t.scaleX}, ${t.scaleY})`;
    el.style.opacity = "1";
    // Double rAF: apply source transform, then expand without synchronous reflow probing.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setExpanded(true));
    });
  }, [origin]);

  useEffect(() => {
    if (!expanded) return;
    const el = surfaceRef.current;
    if (!el) return;
    el.style.transform = "translate3d(0,0,0) scale(1, 1)";
  }, [expanded]);

  const img = origin.imageUrl;

  return (
    <div
      className="fixed inset-0 z-[40] bg-sam-app"
      data-market-card-origin-loading="1"
      data-market-card-origin-listing={origin.listingId}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 bg-sam-app/70 transition-opacity duration-300"
        data-market-card-origin-backdrop="1"
        style={{ opacity: expanded ? 1 : 0.35 }}
      />
      <div
        ref={surfaceRef}
        className="absolute inset-0 overflow-hidden bg-sam-surface will-change-transform"
        data-market-card-origin-surface="1"
        style={{
          transformOrigin: "center center",
          transition: `transform ${EXPAND_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out`,
          borderRadius: expanded ? 0 : 8,
        }}
      >
        {img ? (
          // Continuity bitmap only — not a second product image fetch owner for detail.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-sam-surface-muted" />
        )}
      </div>
    </div>
  );
}
