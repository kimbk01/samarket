"use client";

/**
 * Sole Marketplace list↔detail presentation coordinator.
 *
 * - ONE 360ms timeline (forward + back).
 * - Opaque cover prevents real detail from reading as a second screen.
 * - Image uses transform interpolation; text uses opacity + position only (no stretch).
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

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const MAX_MORPH_MS = MARKET_CARD_MORPH_DURATION_MS + 2_000;

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
    // Arm reverse BEFORE React route-enter computes ltr-back (system/gesture back).
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

  // System/gesture back: arm reverse from standing detail snapshot when leaving /post → list.
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

function applyRect(el: HTMLElement, rect: TradeMarketMorphRect): void {
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
}

function MarketCardMorphSurface({ session }: { session: TradeMarketCardMorphSession }) {
  const imageRef = useRef<HTMLDivElement | null>(null);
  const sourceTextRef = useRef<HTMLDivElement | null>(null);
  const targetTextRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const frozen = useRef({
    sourceHero: session.thumbRect,
    destHero: session.targetHeroRect,
    sourceContent: session.contentRect,
    destContent: session.targetContentRect,
    hasImage: Boolean(session.imageUrl && (session.thumbRect || session.targetHeroRect)),
  }).current;
  const hasImage = frozen.hasImage;
  const sourceHero = frozen.sourceHero;
  const destHero = frozen.destHero;
  const sourceContent = frozen.sourceContent;
  const destContent = frozen.destContent;

  useLayoutEffect(() => {
    // Start pose = source
    if (hasImage && imageRef.current && sourceHero) {
      const el = imageRef.current;
      el.style.transition = "none";
      applyRect(el, sourceHero);
      el.style.borderRadius = session.direction === "forward" ? "8px" : "0px";
      el.style.opacity = "1";
    }
    if (sourceTextRef.current && sourceContent) {
      const el = sourceTextRef.current;
      el.style.transition = "none";
      applyRect(el, sourceContent);
      el.style.opacity = "1";
    }
    if (targetTextRef.current && destContent) {
      const el = targetTextRef.current;
      el.style.transition = "none";
      applyRect(el, destContent);
      el.style.opacity = "0";
    }

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setExpanded(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // Freeze geometry for this generation — do not restart when target measure publishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation-scoped
  }, [session.generation]);

  useEffect(() => {
    if (!expanded) return;
    const listingId = session.listingId;
    const generation = session.generation;
    const direction = session.direction;
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (direction === "back") {
        const routeKey = takeDeferredTradeMarketListScrollRouteKey() || session.listRouteKey;
        if (routeKey) {
          tryRestoreTradeMarketListScroll(routeKey);
        }
      }
      clearTradeMarketCardMorphIfGeneration(listingId, generation);
    };

    const releaseWhenRouteReady = () => {
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      if (direction === "forward") {
        if (tradePostIdFromPath(path) === listingId) {
          finish();
          return true;
        }
        return false;
      }
      // back — release once we are on a list surface (or timeout)
      if (isMarketplaceListSurfacePath(path) || !tradePostIdFromPath(path)) {
        finish();
        return true;
      }
      return false;
    };

    const ms = MARKET_CARD_MORPH_DURATION_MS;
    const imageEl = imageRef.current;
    const sourceTextEl = sourceTextRef.current;
    const targetTextEl = targetTextRef.current;

    if (hasImage && imageEl && destHero) {
      imageEl.style.transition = `transform ${ms}ms ${EASE}, width ${ms}ms ${EASE}, height ${ms}ms ${EASE}, border-radius ${ms}ms ease-out, opacity ${ms}ms ease-out`;
      applyRect(imageEl, destHero);
      imageEl.style.borderRadius = direction === "forward" ? "0px" : "8px";
      imageEl.style.opacity = "1";
    } else if (hasImage && imageEl && !destHero) {
      imageEl.style.transition = `opacity ${ms}ms ease-out, transform ${ms}ms ${EASE}`;
      imageEl.style.opacity = "0";
    }

    if (sourceTextEl && sourceContent) {
      sourceTextEl.style.transition = `opacity ${ms}ms ease-out, transform ${ms}ms ${EASE}`;
      if (destContent) {
        sourceTextEl.style.transform = `translate3d(${destContent.x}px, ${destContent.y}px, 0)`;
      }
      sourceTextEl.style.opacity = "0";
    }
    if (targetTextEl && destContent) {
      targetTextEl.style.transition = `opacity ${ms}ms ease-out`;
      targetTextEl.style.opacity = "1";
    }

    // ONE clock: animate 360ms, then hold cover until route owns the destination.
    let poll: number | null = null;
    let forceEnd: number | null = null;
    const afterAnim = window.setTimeout(() => {
      if (releaseWhenRouteReady()) return;
      poll = window.setInterval(() => {
        if (releaseWhenRouteReady() && poll != null) {
          window.clearInterval(poll);
          poll = null;
        }
      }, 32);
      forceEnd = window.setTimeout(() => {
        if (poll != null) window.clearInterval(poll);
        poll = null;
        finish();
      }, 2_000);
    }, ms + 16);

    return () => {
      window.clearTimeout(afterAnim);
      if (poll != null) window.clearInterval(poll);
      if (forceEnd != null) window.clearTimeout(forceEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation-scoped
  }, [expanded, session.generation]);

  const showSourceText = Boolean(sourceContent && (session.priceText || session.titleText || session.locationText));
  const showTargetText = Boolean(destContent && (session.priceText || session.titleText || session.locationText));

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60]"
      data-market-card-morph="1"
      data-market-card-morph-direction={session.direction}
      data-market-card-morph-listing={session.listingId}
      data-market-card-morph-generation={String(session.generation)}
      data-market-card-morph-duration-ms={String(MARKET_CARD_MORPH_DURATION_MS)}
      data-market-card-morph-mode={hasImage ? "image-content" : "content-only"}
      aria-hidden
    >
      {/* Opaque cover — sole perceptual surface until release */}
      <div
        className="absolute inset-0 bg-sam-app"
        data-market-card-morph-cover="1"
        style={{ opacity: 1 }}
      />

      {hasImage && session.imageUrl && sourceHero ? (
        <div
          ref={imageRef}
          data-market-card-morph-image="1"
          className="absolute left-0 top-0 overflow-hidden bg-cover bg-center will-change-transform"
          style={{
            transformOrigin: "top left",
            backgroundImage: `url(${JSON.stringify(session.imageUrl)})`,
          }}
        />
      ) : null}

      {showSourceText && sourceContent ? (
        <div
          ref={sourceTextRef}
          data-market-card-morph-source-text="1"
          className="absolute left-0 top-0 overflow-hidden will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          <MorphTextBlock
            price={session.priceText}
            title={session.titleText}
            location={session.locationText}
            compact
          />
        </div>
      ) : null}

      {showTargetText && destContent ? (
        <div
          ref={targetTextRef}
          data-market-card-morph-target-text="1"
          className="absolute left-0 top-0 overflow-hidden"
          style={{ transformOrigin: "top left" }}
        >
          <MorphTextBlock
            price={session.priceText}
            title={session.titleText}
            location={session.locationText}
            compact={session.direction === "back"}
          />
        </div>
      ) : null}
    </div>
  );
}

function MorphTextBlock({
  price,
  title,
  location,
  compact,
}: {
  price: string;
  title: string;
  location: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-0.5" : "gap-1"} px-0`}>
      {price ? (
        <p className={`truncate font-semibold text-sam-fg ${compact ? "text-[15px]" : "text-[22px]"}`}>
          {price}
        </p>
      ) : null}
      {title ? (
        <p className={`truncate text-sam-fg ${compact ? "text-[13px]" : "text-[17px] font-medium"}`}>
          {title}
        </p>
      ) : null}
      {location ? <p className="truncate text-[12px] text-sam-muted">{location}</p> : null}
    </div>
  );
}
