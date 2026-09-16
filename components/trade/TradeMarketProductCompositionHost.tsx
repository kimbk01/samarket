"use client";

/**
 * Sole Marketplace list↔detail PRODUCT COMPOSITION presentation coordinator.
 *
 * NEW SSOT — not MarketCardMorphHost.
 * ONE active composition · ONE 360ms progress p · ≤1 instance per semantic field.
 * media? optional: if null, media DOM node is not created.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  TRADE_MARKET_COMPOSITION_DURATION_MS,
  armTradeMarketProductCompositionBackFromStandingIfNeeded,
  canAcquireTradeMarketCompositionPerceptualOwnership,
  clearTradeMarketProductCompositionIfGeneration,
  clearTradeMarketProductCompositionStanding,
  isTradeMarketCompositionMediaOwnershipValid,
  peekTradeMarketProductComposition,
  peekTradeMarketProductCompositionStanding,
  subscribeTradeMarketProductComposition,
  takeDeferredTradeMarketListScrollRouteKey,
  tradePostIdFromPath,
  type TradeMarketCompositionRect,
  type TradeMarketProductCompositionSession,
} from "@/lib/trade/marketplace/trade-market-product-composition";
import { tryRestoreTradeMarketListScroll } from "@/lib/trade/location/trade-market-list-scroll-restore";
import { isMarketplaceListSurfacePath } from "@/lib/trade/marketplace/marketplace-detail-stack-slide";

const MAX_MS = TRADE_MARKET_COMPOSITION_DURATION_MS + 2_000;
const EASE = (t: number) => 1 - Math.pow(1 - t, 3.2);

export function TradeMarketProductCompositionHost() {
  const pathname = usePathname();
  const [session, setSession] = useState<TradeMarketProductCompositionSession | null>(null);
  const [mounted, setMounted] = useState(false);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setSession(peekTradeMarketProductComposition());
    const unsub = subscribeTradeMarketProductComposition(() => {
      setSession(peekTradeMarketProductComposition());
    });
    const onPop = () => {
      const standing = peekTradeMarketProductCompositionStanding();
      if (!standing) return;
      const path = window.location.pathname || "";
      if (!isMarketplaceListSurfacePath(path)) return;
      armTradeMarketProductCompositionBackFromStandingIfNeeded({
        fromPostId: standing.listingId,
        listRouteKey: path,
      });
      clearTradeMarketProductCompositionStanding();
    };
    window.addEventListener("popstate", onPop, true);
    return () => {
      unsub();
      window.removeEventListener("popstate", onPop, true);
    };
  }, []);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (!prev) return;
    const fromId = tradePostIdFromPath(prev);
    const toList = isMarketplaceListSurfacePath(pathname);
    if (fromId && toList) {
      const existing = peekTradeMarketProductComposition();
      if (!existing || existing.direction !== "back") {
        armTradeMarketProductCompositionBackFromStandingIfNeeded({
          fromPostId: fromId,
          listRouteKey: pathname.split("?")[0] || "/market",
        });
      }
      clearTradeMarketProductCompositionStanding();
    }
  }, [pathname]);

  useEffect(() => {
    if (!session) return;
    const listingId = session.listingId;
    const generation = session.generation;
    if (!isTradeMarketCompositionMediaOwnershipValid(session)) {
      clearTradeMarketProductCompositionIfGeneration(listingId, generation);
      return;
    }
    // Fail-closed watchdog starts only after ownership may begin; HOLD decode must not be cut short.
    const mediaContract = session.mediaContract;
    if (mediaContract === "present" && session.media?.url) {
      // CompositionSurface owns the paint-ready gate + clock; keep a longer outer bound only.
      const t = window.setTimeout(() => {
        clearTradeMarketProductCompositionIfGeneration(listingId, generation);
      }, MAX_MS + 4_000);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      clearTradeMarketProductCompositionIfGeneration(listingId, generation);
    }, MAX_MS);
    return () => window.clearTimeout(t);
  }, [session]);

  if (!mounted || !session) return null;
  // Forbidden: image product with LOST media must not render text-only composition.
  if (!isTradeMarketCompositionMediaOwnershipValid(session)) return null;
  return createPortal(
    <CompositionSurface
      key={`${session.listingId}:${session.generation}:${session.direction}`}
      session={session}
    />,
    document.body
  );
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function lerpRect(
  source: TradeMarketCompositionRect,
  target: TradeMarketCompositionRect,
  p: number
): TradeMarketCompositionRect {
  return {
    x: lerp(source.x, target.x, p),
    y: lerp(source.y, target.y, p),
    width: Math.max(1, lerp(source.width, target.width, p)),
    height: Math.max(1, lerp(source.height, target.height, p)),
  };
}

function applyBox(el: HTMLElement, rect: TradeMarketCompositionRect): void {
  el.style.left = "0px";
  el.style.top = "0px";
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
}

function CompositionSurface({ session }: { session: TradeMarketProductCompositionSession }) {
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const priceRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const metaRef = useRef<HTMLDivElement | null>(null);

  // Freeze source identity for this generation; targets may silent-patch.
  const frozen = useRef({
    generation: session.generation,
    direction: session.direction,
    media: session.media,
    price: session.price,
    title: session.title,
    meta: session.meta,
  }).current;

  const hasMedia = Boolean(frozen.media);
  const mediaContract = session.mediaContract ?? (hasMedia ? "present" : "absent_by_product");
  // IMAGE product: HOLD perceptual ownership until media decode/paint-ready.
  // During HOLD the portal is not mounted → real detail remains the sole owner (closes rev-t000 gap).
  const [mediaPaintReady, setMediaPaintReady] = useState(mediaContract !== "present");

  useLayoutEffect(() => {
    if (mediaContract !== "present" || !frozen.media?.url) {
      setMediaPaintReady(true);
      return;
    }
    let cancelled = false;
    const listingId = session.listingId;
    const generation = session.generation;
    const url = frozen.media.url;
    const img = new Image();
    img.decoding = "async";

    const succeed = () => {
      if (cancelled) return;
      if (!(img.complete && img.naturalWidth > 0)) return;
      setMediaPaintReady(true);
    };
    const failClosed = () => {
      if (cancelled) return;
      // Never hand off to text-only for an image product.
      clearTradeMarketProductCompositionIfGeneration(listingId, generation);
    };

    img.onload = succeed;
    img.onerror = failClosed;
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      succeed();
    } else if (typeof img.decode === "function") {
      // decode reject ≠ load failure — keep waiting for onload/onerror
      img.decode().then(succeed, () => {});
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation-scoped media gate
  }, [session.generation]);

  useLayoutEffect(() => {
    if (
      !canAcquireTradeMarketCompositionPerceptualOwnership({
        mediaContract,
        media: frozen.media,
        mediaPaintReady,
      })
    ) {
      return;
    }

    const listingId = session.listingId;
    const generation = session.generation;
    const direction = session.direction;
    let raf = 0;
    let ended = false;
    let poll: number | null = null;
    let forceEnd: number | null = null;
    // Clock starts only after ownership is allowed — same commit as first paintable frame.
    const start = performance.now();

    const finish = () => {
      if (ended) return;
      ended = true;
      if (raf) cancelAnimationFrame(raf);
      if (direction === "back") {
        const routeKey = takeDeferredTradeMarketListScrollRouteKey() || session.listRouteKey;
        if (routeKey) tryRestoreTradeMarketListScroll(routeKey);
      }
      clearTradeMarketProductCompositionIfGeneration(listingId, generation);
    };

    const routeReady = () => {
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      if (direction === "forward") return tradePostIdFromPath(path) === listingId;
      return isMarketplaceListSurfacePath(path) || !tradePostIdFromPath(path);
    };

    const readLive = () => {
      const live = peekTradeMarketProductComposition();
      return live && live.generation === generation ? live : session;
    };

    const paint = (pRaw: number) => {
      const p = EASE(Math.min(1, Math.max(0, pRaw)));
      const live = readLive();

      if (frozen.media && mediaRef.current) {
        const end = live.media?.target ?? frozen.media.target;
        const rect = lerpRect(frozen.media.source, end, p);
        applyBox(mediaRef.current, rect);
        const startR = direction === "forward" ? 8 : 0;
        const endR = direction === "forward" ? 0 : 8;
        mediaRef.current.style.borderRadius = `${lerp(startR, endR, p)}px`;
        mediaRef.current.style.opacity = "1";
      }

      if (frozen.price && priceRef.current) {
        let target = live.price?.target ?? frozen.price.target;
        const mediaEnd = live.media?.target ?? frozen.media?.target ?? null;
        if (mediaEnd && target.y + 2 < mediaEnd.y + mediaEnd.height) {
          target = {
            ...target,
            y: mediaEnd.y + mediaEnd.height + 12,
          };
        }
        applyBox(priceRef.current, lerpRect(frozen.price.source, target, p));
        const fs = direction === "forward" ? lerp(15, 22, p) : lerp(22, 15, p);
        priceRef.current.style.fontSize = `${fs}px`;
        priceRef.current.style.opacity = "1";
      }

      if (frozen.title && titleRef.current) {
        let target = live.title?.target ?? frozen.title.target;
        const mediaEnd = live.media?.target ?? frozen.media?.target ?? null;
        if (mediaEnd && target.y + 2 < mediaEnd.y + mediaEnd.height) {
          target = {
            ...target,
            y: mediaEnd.y + mediaEnd.height + 44,
          };
        }
        applyBox(titleRef.current, lerpRect(frozen.title.source, target, p));
        const fs = direction === "forward" ? lerp(13, 17, p) : lerp(17, 13, p);
        titleRef.current.style.fontSize = `${fs}px`;
        titleRef.current.style.opacity = "1";
      }

      if (frozen.meta && metaRef.current) {
        let target = live.meta?.target ?? frozen.meta.target;
        const mediaEnd = live.media?.target ?? frozen.media?.target ?? null;
        if (mediaEnd && target.y + 2 < mediaEnd.y + mediaEnd.height) {
          target = {
            ...target,
            y: mediaEnd.y + mediaEnd.height + 72,
          };
        }
        applyBox(metaRef.current, lerpRect(frozen.meta.source, target, p));
        metaRef.current.style.fontSize = "12px";
        metaRef.current.style.opacity = "1";
      }
    };

    paint(0);

    const tick = (now: number) => {
      if (ended) return;
      const p = Math.min(1, (now - start) / TRADE_MARKET_COMPOSITION_DURATION_MS);
      paint(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (routeReady()) {
        finish();
        return;
      }
      poll = window.setInterval(() => {
        paint(1);
        if (routeReady()) {
          if (poll != null) window.clearInterval(poll);
          poll = null;
          finish();
        }
      }, 32);
      forceEnd = window.setTimeout(() => {
        if (poll != null) window.clearInterval(poll);
        poll = null;
        finish();
      }, 2_000);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      ended = true;
      if (raf) cancelAnimationFrame(raf);
      if (poll != null) window.clearInterval(poll);
      if (forceEnd != null) window.clearTimeout(forceEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation-scoped single clock after paint-ready
  }, [session.generation, mediaPaintReady]);

  if (
    !canAcquireTradeMarketCompositionPerceptualOwnership({
      mediaContract,
      media: frozen.media,
      mediaPaintReady,
    })
  ) {
    // HOLD: session armed but composition does not own the screen yet.
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60]"
      data-trade-product-composition="1"
      data-trade-product-composition-direction={session.direction}
      data-trade-product-composition-listing={session.listingId}
      data-trade-product-composition-generation={String(session.generation)}
      data-trade-product-composition-duration-ms={String(TRADE_MARKET_COMPOSITION_DURATION_MS)}
      data-trade-product-composition-mode={mediaContract === "present" ? "with-media" : "content-only"}
      data-trade-product-composition-media-contract={mediaContract}
      data-trade-product-composition-media-paint-ready="1"
      aria-hidden
    >
      <div className="absolute inset-0 bg-sam-app" data-trade-product-composition-cover="1" />

      {frozen.media ? (
        <div
          ref={mediaRef}
          data-trade-product-composition-slot="media"
          data-trade-product-composition-media-contract="present"
          className="absolute left-0 top-0 overflow-hidden will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {/* Replaced element — CSS backgroundImage can layout-own while painting blank (R5). */}
          <img
            src={frozen.media.url}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
            decoding="sync"
          />
        </div>
      ) : (
        // Explicit absent-by-product: do not mount a media node.
        null
      )}

      {frozen.price ? (
        <div
          ref={priceRef}
          data-trade-product-composition-slot="price"
          className="absolute left-0 top-0 overflow-hidden font-semibold leading-tight text-sam-fg will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {frozen.price.text}
        </div>
      ) : null}

      {frozen.title ? (
        <div
          ref={titleRef}
          data-trade-product-composition-slot="title"
          className="absolute left-0 top-0 overflow-hidden leading-tight text-sam-fg will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {frozen.title.text}
        </div>
      ) : null}

      {frozen.meta ? (
        <div
          ref={metaRef}
          data-trade-product-composition-slot="meta"
          className="absolute left-0 top-0 overflow-hidden leading-tight text-sam-muted will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {frozen.meta.text}
        </div>
      ) : null}
    </div>
  );
}
