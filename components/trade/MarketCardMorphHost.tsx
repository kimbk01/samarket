"use client";

/**
 * Sole Marketplace list↔detail presentation coordinator.
 *
 * PERCEPTUAL CONTRACT:
 * - ONE composition owner · ONE 360ms progress p · ONE semantic instance per field.
 * - Image + price + title + meta participate from p=0 under the same clock.
 * - NO source/target text crossfade · NO independent image-first presentation.
 * - Text stays normally rendered (layout geometry interpolates; no glyph transform scale).
 * - Navigation remains <Link> / App Router.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  MARKET_CARD_MORPH_DURATION_MS,
  armTradeMarketCardMorphBackFromStandingIfNeeded,
  clearTradeMarketCardMorphIfGeneration,
  clearTradeMarketDetailStandingSnapshot,
  peekTradeMarketCardMorph,
  peekTradeMarketDetailStandingSnapshot,
  subscribeTradeMarketCardMorph,
  takeDeferredTradeMarketListScrollRouteKey,
  tradePostIdFromPath,
  type TradeMarketCardMorphSession,
  type TradeMarketMorphRect,
} from "@/lib/trade/marketplace/trade-market-card-morph";
import { tryRestoreTradeMarketListScroll } from "@/lib/trade/location/trade-market-list-scroll-restore";
import { isMarketplaceListSurfacePath } from "@/lib/trade/marketplace/marketplace-detail-stack-slide";

const MAX_MORPH_MS = MARKET_CARD_MORPH_DURATION_MS + 2_000;
const EASE = (t: number) => {
  // cubic-bezier(0.22, 1, 0.36, 1) approx via easeOutExpo-ish
  return 1 - Math.pow(1 - t, 3.2);
};

export function MarketCardMorphHost() {
  const pathname = usePathname();
  const [session, setSession] = useState<TradeMarketCardMorphSession | null>(null);
  const [mounted, setMounted] = useState(false);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setSession(peekTradeMarketCardMorph());
    const unsub = subscribeTradeMarketCardMorph(() => {
      setSession(peekTradeMarketCardMorph());
    });
    const onPop = () => {
      const standing = peekTradeMarketDetailStandingSnapshot();
      if (!standing) return;
      const path = window.location.pathname || "";
      if (!isMarketplaceListSurfacePath(path)) return;
      armTradeMarketCardMorphBackFromStandingIfNeeded({
        fromPostId: standing.listingId,
        listRouteKey: path,
      });
      clearTradeMarketDetailStandingSnapshot();
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
      const existing = peekTradeMarketCardMorph();
      if (!existing || existing.direction !== "back") {
        armTradeMarketCardMorphBackFromStandingIfNeeded({
          fromPostId: fromId,
          listRouteKey: pathname.split("?")[0] || "/market",
        });
      }
      clearTradeMarketDetailStandingSnapshot();
    }
  }, [pathname]);

  useEffect(() => {
    if (!session) return;
    const listingId = session.listingId;
    const generation = session.generation;
    const t = window.setTimeout(() => {
      clearTradeMarketCardMorphIfGeneration(listingId, generation);
    }, MAX_MORPH_MS);
    return () => window.clearTimeout(t);
  }, [session]);

  if (!mounted || !session) return null;
  return createPortal(
    <MarketCardMorphSurface key={`${session.listingId}:${session.generation}:${session.direction}`} session={session} />,
    document.body
  );
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function lerpRect(
  source: TradeMarketMorphRect | null,
  target: TradeMarketMorphRect | null,
  p: number
): TradeMarketMorphRect | null {
  if (!source && !target) return null;
  if (!source) return target;
  if (!target) return source;
  return {
    x: lerp(source.x, target.x, p),
    y: lerp(source.y, target.y, p),
    width: Math.max(1, lerp(source.width, target.width, p)),
    height: Math.max(1, lerp(source.height, target.height, p)),
  };
}

function applyBox(el: HTMLElement, rect: TradeMarketMorphRect): void {
  el.style.left = "0px";
  el.style.top = "0px";
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
}

function MarketCardMorphSurface({ session }: { session: TradeMarketCardMorphSession }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLDivElement | null>(null);
  const priceRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const locationRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef(0);

  // Freeze SOURCE geometry for this generation. End targets may be patched silently by publish.
  const source = useRef({
    generation: session.generation,
    direction: session.direction,
    imageUrl: session.imageUrl,
    priceText: session.priceText,
    titleText: session.titleText,
    locationText: session.locationText,
    thumb: session.thumbRect,
    price: session.priceRect ?? null,
    title: session.titleRect ?? null,
    location: session.locationRect ?? null,
    // fallbacks when field rect missing
    content: session.contentRect,
    heroFallback: session.targetHeroRect,
    contentFallback: session.targetContentRect,
  }).current;

  const hasImage = Boolean(source.imageUrl && (source.thumb || source.heroFallback));

  useLayoutEffect(() => {
    const listingId = session.listingId;
    const generation = session.generation;
    const direction = session.direction;
    let raf = 0;
    let ended = false;
    let poll: number | null = null;
    let forceEnd: number | null = null;
    const start = performance.now();

    const finish = () => {
      if (ended) return;
      ended = true;
      if (raf) cancelAnimationFrame(raf);
      if (direction === "back") {
        const routeKey = takeDeferredTradeMarketListScrollRouteKey() || session.listRouteKey;
        if (routeKey) tryRestoreTradeMarketListScroll(routeKey);
      }
      clearTradeMarketCardMorphIfGeneration(listingId, generation);
    };

    const routeReady = () => {
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      if (direction === "forward") return tradePostIdFromPath(path) === listingId;
      return isMarketplaceListSurfacePath(path) || !tradePostIdFromPath(path);
    };

    const readEnds = () => {
      const live = peekTradeMarketCardMorph();
      const same = live && live.generation === generation ? live : session;
      const hero = same.targetHeroRect;
      // Defense: never drive text into the hero even if a bad live measure slipped through.
      const price =
        same.targetPriceRect && hero && same.targetPriceRect.y + 2 < hero.y + hero.height
          ? null
          : same.targetPriceRect;
      const title =
        same.targetTitleRect && hero && same.targetTitleRect.y + 2 < hero.y + hero.height
          ? null
          : same.targetTitleRect;
      const location =
        same.targetLocationRect && hero && same.targetLocationRect.y + 2 < hero.y + hero.height
          ? null
          : same.targetLocationRect;
      return {
        hero,
        price,
        title,
        location,
        content:
          same.targetContentRect && hero && same.targetContentRect.y + 2 < hero.y + hero.height
            ? null
            : same.targetContentRect,
      };
    };

    const paint = (pRaw: number) => {
      const p = EASE(Math.min(1, Math.max(0, pRaw)));
      progressRef.current = p;
      const ends = readEnds();

      if (hasImage && imageRef.current && source.thumb) {
        const endHero = ends.hero ?? source.heroFallback;
        const rect = lerpRect(source.thumb, endHero, p);
        if (rect) {
          applyBox(imageRef.current, rect);
          const startR = direction === "forward" ? 8 : 0;
          const endR = direction === "forward" ? 0 : 8;
          imageRef.current.style.borderRadius = `${lerp(startR, endR, p)}px`;
          imageRef.current.style.opacity = "1";
        }
      }

      // ONE instance per semantic field — layout geometry only (no transform:scale on glyphs).
      const priceSrc = source.price ?? (source.content ? { ...source.content, height: 22 } : null);
      const titleSrc =
        source.title ??
        (source.content
          ? { x: source.content.x, y: source.content.y + 24, width: source.content.width, height: 20 }
          : null);
      const locSrc =
        source.location ??
        (source.content
          ? { x: source.content.x, y: source.content.y + 46, width: source.content.width, height: 16 }
          : null);

      const priceEnd = ends.price ?? (ends.content ? { ...ends.content, height: 28 } : null);
      const titleEnd =
        ends.title ??
        (ends.content
          ? { x: ends.content.x, y: ends.content.y + 32, width: ends.content.width, height: 24 }
          : null);
      const locEnd =
        ends.location ??
        (ends.content
          ? { x: ends.content.x, y: ends.content.y + 60, width: ends.content.width, height: 18 }
          : null);

      if (priceRef.current && source.priceText && priceSrc) {
        const rect = lerpRect(priceSrc, priceEnd, p);
        if (rect) {
          applyBox(priceRef.current, rect);
          const fs = direction === "forward" ? lerp(15, 22, p) : lerp(22, 15, p);
          priceRef.current.style.fontSize = `${fs}px`;
          priceRef.current.style.opacity = "1";
        }
      }
      if (titleRef.current && source.titleText && titleSrc) {
        const rect = lerpRect(titleSrc, titleEnd, p);
        if (rect) {
          applyBox(titleRef.current, rect);
          const fs = direction === "forward" ? lerp(13, 17, p) : lerp(17, 13, p);
          titleRef.current.style.fontSize = `${fs}px`;
          titleRef.current.style.opacity = "1";
        }
      }
      if (locationRef.current && source.locationText && locSrc) {
        const rect = lerpRect(locSrc, locEnd, p);
        if (rect) {
          applyBox(locationRef.current, rect);
          locationRef.current.style.fontSize = "12px";
          locationRef.current.style.opacity = "1";
        }
      }
    };

    // Start pose immediately (p=0) — all fields visible together.
    paint(0);

    const tick = (now: number) => {
      if (ended) return;
      const p = Math.min(1, (now - start) / MARKET_CARD_MORPH_DURATION_MS);
      paint(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // Hold cover at p=1 until route owns destination, then hand off once.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation-scoped single clock
  }, [session.generation]);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-0 z-[60]"
      data-market-card-morph="1"
      data-market-card-morph-direction={session.direction}
      data-market-card-morph-listing={session.listingId}
      data-market-card-morph-generation={String(session.generation)}
      data-market-card-morph-duration-ms={String(MARKET_CARD_MORPH_DURATION_MS)}
      data-market-card-morph-mode={hasImage ? "image-content" : "content-only"}
      data-market-card-morph-model="semantic-single-p"
      aria-hidden
    >
      <div
        className="absolute inset-0 bg-sam-app"
        data-market-card-morph-cover="1"
        style={{ opacity: 1 }}
      />

      {hasImage && source.imageUrl && source.thumb ? (
        <div
          ref={imageRef}
          data-market-card-morph-image="1"
          data-market-card-morph-semantic="image"
          className="absolute left-0 top-0 overflow-hidden bg-cover bg-center will-change-transform"
          style={{
            transformOrigin: "top left",
            backgroundImage: `url(${JSON.stringify(source.imageUrl)})`,
          }}
        />
      ) : null}

      {source.priceText ? (
        <div
          ref={priceRef}
          data-market-card-morph-semantic="price"
          className="absolute left-0 top-0 overflow-hidden font-semibold leading-tight text-sam-fg will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {source.priceText}
        </div>
      ) : null}

      {source.titleText ? (
        <div
          ref={titleRef}
          data-market-card-morph-semantic="title"
          className="absolute left-0 top-0 overflow-hidden leading-tight text-sam-fg will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {source.titleText}
        </div>
      ) : null}

      {source.locationText ? (
        <div
          ref={locationRef}
          data-market-card-morph-semantic="meta"
          className="absolute left-0 top-0 overflow-hidden leading-tight text-sam-muted will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {source.locationText}
        </div>
      ) : null}
    </div>
  );
}
