"use client";

/**
 * Sole Marketplace card→detail visual transition owner.
 *
 * DELETED (V2): whole-card HTML snapshot + non-uniform scale to viewport
 * (produced stretched typography / "rubber card").
 *
 * CURRENT:
 * - WITH image: compositor FLIP of the thumbnail image only → detail hero.
 * - WITHOUT image: plain surface veil from card rect → viewport (no text clone;
 *   empty LIST thumbnail slot is never animated into a fake media hero).
 * - Single 360ms timeline; Link/App Router remain navigation owner.
 * - Independent of whether Next mounts `loading.tsx` (cold vs warm RSC).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  CARD_ORIGIN_EXPAND_DURATION_MS,
  clearTradeMarketCardOriginExpandIfGeneration,
  peekTradeMarketCardOriginExpand,
  subscribeTradeMarketCardOriginExpand,
  tradeMarketCardOriginHeroTarget,
  tradePostIdFromPath,
  type TradeMarketCardOriginExpand,
} from "@/lib/trade/marketplace/trade-market-card-origin-expand";

/** Hard cap so a stuck overlay cannot linger. */
const MAX_OVERLAY_MS = CARD_ORIGIN_EXPAND_DURATION_MS + 2_000;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

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
    if (postId && postId !== origin.listingId) {
      clearTradeMarketCardOriginExpandIfGeneration(origin.listingId, origin.generation);
      return;
    }
    if (seenMatchingDetailRef.current) {
      clearTradeMarketCardOriginExpandIfGeneration(origin.listingId, origin.generation);
    }
  }, [pathname, origin]);

  useEffect(() => {
    if (!origin) return;
    const listingId = origin.listingId;
    const generation = origin.generation;
    const t = window.setTimeout(() => {
      clearTradeMarketCardOriginExpandIfGeneration(listingId, generation);
    }, MAX_OVERLAY_MS);
    return () => window.clearTimeout(t);
  }, [origin]);

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
  const imageRef = useRef<HTMLDivElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const hasImage = Boolean(origin.imageUrl && origin.thumbRect);

  useLayoutEffect(() => {
    const thumb = origin.thumbRect;

    if (hasImage && imageRef.current && thumb) {
      const el = imageRef.current;
      el.style.transition = "none";
      el.style.transform = `translate3d(${thumb.x}px, ${thumb.y}px, 0) scale(1, 1)`;
      el.style.borderRadius = "8px";
      el.style.opacity = "1";
    }

    if (veilRef.current) {
      const veil = veilRef.current;
      const src = origin.rect;
      veil.style.transition = "none";
      veil.style.transform = `translate3d(${src.x}px, ${src.y}px, 0) scale(1, 1)`;
      veil.style.opacity = hasImage ? "0" : "1";
      veil.style.borderRadius = "8px";
      const sx = Math.max(1, origin.viewport.width / Math.max(1, src.width));
      const sy = Math.max(1, origin.viewport.height / Math.max(1, src.height));
      veil.dataset.targetScaleX = String(sx);
      veil.dataset.targetScaleY = String(sy);
    }

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setExpanded(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [origin, hasImage]);

  useEffect(() => {
    if (!expanded) return;
    const thumb = origin.thumbRect;
    const hero = tradeMarketCardOriginHeroTarget(origin);
    const listingId = origin.listingId;
    const generation = origin.generation;
    let ended = false;
    const markEnd = (ev?: TransitionEvent) => {
      if (ev && ev.propertyName !== "transform") return;
      if (ended) return;
      ended = true;
      clearTradeMarketCardOriginExpandIfGeneration(listingId, generation);
    };

    const imageEl = imageRef.current;
    const veilEl = veilRef.current;

    if (hasImage && imageEl && thumb) {
      const scaleX = hero.width / Math.max(1, thumb.width);
      const scaleY = hero.height / Math.max(1, thumb.height);
      imageEl.style.transition = `transform ${CARD_ORIGIN_EXPAND_DURATION_MS}ms ${EASE}, border-radius ${CARD_ORIGIN_EXPAND_DURATION_MS}ms ease-out, opacity 120ms ease-out ${Math.max(0, CARD_ORIGIN_EXPAND_DURATION_MS - 100)}ms`;
      imageEl.style.transform = `translate3d(${hero.x}px, ${hero.y}px, 0) scale(${scaleX}, ${scaleY})`;
      imageEl.style.borderRadius = "0px";
      imageEl.style.opacity = "0";
      imageEl.addEventListener("transitionend", markEnd);
    }

    if (veilEl) {
      const sx = Number(veilEl.dataset.targetScaleX || "1");
      const sy = Number(veilEl.dataset.targetScaleY || "1");
      veilEl.style.transition = `transform ${CARD_ORIGIN_EXPAND_DURATION_MS}ms ${EASE}, opacity ${CARD_ORIGIN_EXPAND_DURATION_MS}ms ease-out, border-radius ${CARD_ORIGIN_EXPAND_DURATION_MS}ms ease-out`;
      veilEl.style.transform = `translate3d(0,0,0) scale(${sx}, ${sy})`;
      veilEl.style.borderRadius = "0px";
      veilEl.style.opacity = "0";
      if (!hasImage) {
        veilEl.addEventListener("transitionend", markEnd);
      }
    }

    const fallback = window.setTimeout(() => markEnd(), CARD_ORIGIN_EXPAND_DURATION_MS + 40);
    return () => {
      imageEl?.removeEventListener("transitionend", markEnd);
      veilEl?.removeEventListener("transitionend", markEnd);
      window.clearTimeout(fallback);
    };
  }, [expanded, origin, hasImage]);

  const thumb = origin.thumbRect ?? origin.rect;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60]"
      data-market-card-origin-loading="1"
      data-market-card-origin-overlay="1"
      data-market-card-origin-listing={origin.listingId}
      data-market-card-origin-generation={String(origin.generation)}
      data-market-card-origin-duration-ms={String(CARD_ORIGIN_EXPAND_DURATION_MS)}
      data-market-card-origin-mode={hasImage ? "image-flip" : "surface-veil"}
      aria-hidden
    >
      <div
        className="absolute inset-0 bg-sam-app"
        data-market-card-origin-scrim="1"
        style={{
          opacity: expanded ? (hasImage ? 0.35 : 0.55) : 0,
          transition: `opacity ${CARD_ORIGIN_EXPAND_DURATION_MS}ms ease-out`,
        }}
      />

      <div
        ref={veilRef}
        className="absolute left-0 top-0 overflow-hidden bg-sam-surface will-change-transform"
        data-market-card-origin-surface="1"
        data-market-card-origin-source={hasImage ? "image-coordinated" : "surface-veil"}
        style={{
          width: origin.rect.width,
          height: origin.rect.height,
          transformOrigin: "top left",
        }}
      />

      {hasImage && origin.imageUrl ? (
        <div
          ref={imageRef}
          role="presentation"
          data-market-card-origin-image="1"
          className="absolute left-0 top-0 bg-cover bg-center will-change-transform"
          style={{
            width: thumb.width,
            height: thumb.height,
            transformOrigin: "top left",
            backgroundImage: `url(${JSON.stringify(origin.imageUrl)})`,
          }}
        />
      ) : null}
    </div>
  );
}
