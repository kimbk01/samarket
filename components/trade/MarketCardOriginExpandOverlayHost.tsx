"use client";

/**
 * Sole Marketplace card→detail visual transition owner.
 * Independent of whether Next mounts `loading.tsx` (cold vs warm RSC).
 * Never owns navigation.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  CARD_ORIGIN_EXPAND_DURATION_MS,
  clearTradeMarketCardOriginExpandIfGeneration,
  peekTradeMarketCardOriginExpand,
  subscribeTradeMarketCardOriginExpand,
  tradeMarketCardOriginExpandTransform,
  tradePostIdFromPath,
  type TradeMarketCardOriginExpand,
} from "@/lib/trade/marketplace/trade-market-card-origin-expand";

/** Hard cap so a stuck overlay cannot linger. */
const MAX_OVERLAY_MS = CARD_ORIGIN_EXPAND_DURATION_MS + 2_000;

export function MarketCardOriginExpandOverlayHost() {
  const pathname = usePathname();
  const [origin, setOrigin] = useState<TradeMarketCardOriginExpand | null>(null);
  const [mounted, setMounted] = useState(false);
  const seenMatchingDetailRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    setOrigin(peekTradeMarketCardOriginExpand());
    return subscribeTradeMarketCardOriginExpand(() => {
      setOrigin(peekTradeMarketCardOriginExpand());
    });
  }, []);

  useEffect(() => {
    if (!origin) {
      seenMatchingDetailRef.current = false;
      return;
    }
    const postId = tradePostIdFromPath(pathname);
    if (postId === origin.listingId) {
      seenMatchingDetailRef.current = true;
      return;
    }
    // Unrelated detail — drop stale session.
    if (postId && postId !== origin.listingId) {
      clearTradeMarketCardOriginExpandIfGeneration(origin.listingId, origin.generation);
      return;
    }
    // Back to market (or non-post) only after we actually reached matching detail.
    if (seenMatchingDetailRef.current) {
      clearTradeMarketCardOriginExpandIfGeneration(origin.listingId, origin.generation);
    }
  }, [pathname, origin]);

  useEffect(() => {
    if (!origin) return;
    const t = window.setTimeout(() => {
      clearTradeMarketCardOriginExpandIfGeneration(origin.listingId, origin.generation);
    }, MAX_OVERLAY_MS);
    return () => window.clearTimeout(t);
  }, [origin?.listingId, origin?.generation, origin?.capturedAt]);

  if (!mounted || !origin) return null;
  return createPortal(
    <MarketCardOriginExpandSurface
      key={`${origin.listingId}:${origin.generation}`}
      origin={origin}
    />,
    document.body
  );
}

function MarketCardOriginExpandSurface({ origin }: { origin: TradeMarketCardOriginExpand }) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const finishedRef = useRef(false);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTradeMarketCardOriginExpandIfGeneration(origin.listingId, origin.generation);
  };

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    finishedRef.current = false;
    const t = tradeMarketCardOriginExpandTransform(origin);
    el.style.transition = "none";
    el.style.transform = `translate3d(${t.translateX}px, ${t.translateY}px, 0) scale(${t.scaleX}, ${t.scaleY})`;
    el.style.opacity = "1";
    el.style.borderRadius = "8px";
    // Double rAF: paint source transform, then expand.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setExpanded(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [origin]);

  useEffect(() => {
    if (!expanded) return;
    const el = surfaceRef.current;
    if (!el) return;
    el.style.transition = `transform ${CARD_ORIGIN_EXPAND_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out, border-radius ${CARD_ORIGIN_EXPAND_DURATION_MS}ms ease-out`;
    el.style.transform = "translate3d(0,0,0) scale(1, 1)";
    el.style.borderRadius = "0px";

    const onEnd = (ev: TransitionEvent) => {
      if (ev.target !== el) return;
      if (ev.propertyName !== "transform") return;
      finish();
    };
    el.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(finish, CARD_ORIGIN_EXPAND_DURATION_MS + 40);
    return () => {
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [expanded, origin.listingId, origin.generation]);

  const img = origin.imageUrl;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] bg-sam-app/40"
      data-market-card-origin-loading="1"
      data-market-card-origin-overlay="1"
      data-market-card-origin-listing={origin.listingId}
      data-market-card-origin-generation={String(origin.generation)}
      data-market-card-origin-duration-ms={String(CARD_ORIGIN_EXPAND_DURATION_MS)}
      aria-hidden
    >
      <div
        ref={surfaceRef}
        className="absolute inset-0 overflow-hidden bg-sam-surface will-change-transform"
        data-market-card-origin-surface="1"
        style={{
          transformOrigin: "center center",
        }}
      >
        {img ? (
          // Continuity bitmap — already shown on the card; not a detail data owner.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full bg-sam-surface" data-market-card-origin-no-image="1" />
        )}
      </div>
    </div>
  );
}
