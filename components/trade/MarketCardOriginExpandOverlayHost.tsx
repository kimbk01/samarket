"use client";

/**
 * Card-origin expand overlay — visual-only portal.
 * Shown on intentional Marketplace card→detail selection even when
 * Next `loading.tsx` is skipped (warm RSC). Never owns navigation.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clearTradeMarketCardOriginExpand,
  peekTradeMarketCardOriginExpand,
  subscribeTradeMarketCardOriginExpand,
  tradeMarketCardOriginExpandTransform,
  type TradeMarketCardOriginExpand,
} from "@/lib/trade/marketplace/trade-market-card-origin-expand";

const EXPAND_MS = 320;
const MAX_OVERLAY_MS = 2_400;

export function MarketCardOriginExpandOverlayHost() {
  const [origin, setOrigin] = useState<TradeMarketCardOriginExpand | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOrigin(peekTradeMarketCardOriginExpand());
    return subscribeTradeMarketCardOriginExpand(() => {
      setOrigin(peekTradeMarketCardOriginExpand());
    });
  }, []);

  useEffect(() => {
    if (!origin) return;
    const t = window.setTimeout(() => {
      clearTradeMarketCardOriginExpand();
      setOrigin(null);
    }, MAX_OVERLAY_MS);
    return () => window.clearTimeout(t);
  }, [origin?.listingId, origin?.capturedAt]);

  if (!mounted || !origin) return null;
  return createPortal(<MarketCardOriginExpandSurface origin={origin} />, document.body);
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
      className="pointer-events-none fixed inset-0 z-[60] bg-sam-app/40"
      data-market-card-origin-loading="1"
      data-market-card-origin-listing={origin.listingId}
      aria-hidden
    >
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
          // Continuity bitmap — already shown on the card; not a detail data owner.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full bg-sam-surface-muted" />
        )}
      </div>
    </div>
  );
}
