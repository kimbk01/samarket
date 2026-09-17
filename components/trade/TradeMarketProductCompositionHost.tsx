"use client";

/**
 * Sole Marketplace list↔detail PRODUCT COMPOSITION presentation coordinator.
 *
 * FORWARD (F7 closed): ONE selected PRODUCT composition → coherent opacity handoff → detail.
 * Forbidden: independent media/price/title/meta source→target geometric flight (thumbnail→hero).
 *
 * REVERSE: retained-list destination architecture LOCKED (per-slot dock morph preserved).
 *
 * Navigation remains `<Link>` + App Router.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  TRADE_MARKET_COMPOSITION_DURATION_MS,
  armTradeMarketProductCompositionBackFromStandingIfNeeded,
  bindTradeMarketReverseLiveDestinationTargets,
  canAcquireTradeMarketCompositionPerceptualOwnership,
  clearTradeMarketProductCompositionIfGeneration,
  clearTradeMarketProductCompositionStanding,
  findTradeMarketListDestinationCard,
  isTradeMarketCompositionMediaOwnershipValid,
  isTradeMarketReverseDestinationDocked,
  isTradeMarketReverseLiveDestinationBound,
  measureListComposition,
  peekTradeMarketProductComposition,
  peekTradeMarketProductCompositionStanding,
  peekTradeMarketReverseLiveBindCount,
  readTradeMarketCompositionRect,
  subscribeTradeMarketProductComposition,
  tradePostIdFromPath,
  type TradeMarketCompositionRect,
  type TradeMarketProductCompositionSession,
} from "@/lib/trade/marketplace/trade-market-product-composition";
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
    const mediaContract = session.mediaContract;
    if (mediaContract === "present" && session.media?.url) {
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

/** REVERSE ONLY — forward must never call this for media/price/title/meta flight. */
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

/** REVERSE ONLY — forward product children stay in flow; no independent applyBox flight. */
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
  const productRef = useRef<HTMLDivElement | null>(null);
  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const hiddenDestinationRef = useRef<HTMLElement | null>(null);
  const reverseDockReadyRef = useRef(false);
  const reverseHandoffFrameRef = useRef(false);
  const forwardLaidOutRef = useRef(false);

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
  const isForward = session.direction === "forward";
  const [mediaPaintReady, setMediaPaintReady] = useState(mediaContract !== "present");
  const [reverseListDockReady, setReverseListDockReady] = useState(false);
  const [slotsArmed, setSlotsArmed] = useState(false);

  const restoreDestinationCard = () => {
    const card = hiddenDestinationRef.current;
    if (!card) return;
    card.style.visibility = "";
    card.removeAttribute("data-trade-product-composition-destination-hidden");
    hiddenDestinationRef.current = null;
  };

  const hideDestinationCard = (card: HTMLElement) => {
    if (hiddenDestinationRef.current === card) return;
    restoreDestinationCard();
    hiddenDestinationRef.current = card;
    card.setAttribute("data-trade-product-composition-destination-hidden", "1");
    card.style.visibility = "hidden";
  };

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
      clearTradeMarketProductCompositionIfGeneration(listingId, generation);
    };

    img.onload = succeed;
    img.onerror = failClosed;
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      succeed();
    } else if (typeof img.decode === "function") {
      img.decode().then(succeed, () => {});
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation-scoped media gate
  }, [session.generation]);

  /**
   * FORWARD: pin ONE product composition at list source size. Never grow media to hero.
   */
  const layoutForwardProductOnce = () => {
    if (forwardLaidOutRef.current) return;
    const root = productRef.current;
    if (!root) return;
    const media = frozen.media?.source ?? null;
    const price = frozen.price?.source ?? null;
    const title = frozen.title?.source ?? null;
    const meta = frozen.meta?.source ?? null;
    const left = media?.x ?? price?.x ?? title?.x ?? meta?.x ?? 0;
    const top = media?.y ?? price?.y ?? title?.y ?? meta?.y ?? 0;
    const width = Math.max(
      1,
      media?.width ?? price?.width ?? title?.width ?? meta?.width ?? 180
    );
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.width = `${width}px`;
    root.style.transform = "none";
    if (mediaRef.current && media) {
      mediaRef.current.style.width = `${media.width}px`;
      mediaRef.current.style.height = `${media.height}px`;
      mediaRef.current.style.transform = "none";
      mediaRef.current.style.borderRadius = "8px";
    }
    forwardLaidOutRef.current = true;
  };

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
    let reverseFlightStarted = false;
    let forwardFlightStarted = false;
    let reverseBoundOnce = false;
    let start = performance.now();

    const finish = () => {
      if (ended) return;
      ended = true;
      if (raf) cancelAnimationFrame(raf);
      const portal = portalRootRef.current;
      if (portal) portal.style.display = "none";
      restoreDestinationCard();
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

    const prepareReverseDestinationOnce = (): boolean => {
      if (direction !== "back") return true;
      if (!isMarketplaceListSurfacePath(typeof window !== "undefined" ? window.location.pathname : "")) {
        return readLive().destinationCommitted;
      }

      if (isTradeMarketReverseLiveDestinationBound(listingId, generation) || reverseBoundOnce) {
        const card = findTradeMarketListDestinationCard(listingId);
        if (card) hideDestinationCard(card);
        reverseDockReadyRef.current = true;
        if (coverRef.current) coverRef.current.style.display = "none";
        setReverseListDockReady(true);
        return true;
      }

      if (readLive().destinationCommitted) {
        const card = findTradeMarketListDestinationCard(listingId);
        if (card) {
          const measured = measureListComposition(card);
          if (measured.mediaRect || measured.priceRect || measured.titleRect) {
            bindTradeMarketReverseLiveDestinationTargets({
              listingId,
              mediaRect: measured.mediaRect,
              priceRect: measured.priceRect,
              titleRect: measured.titleRect,
              metaRect: measured.metaRect,
            });
            hideDestinationCard(card);
          }
        }
        reverseBoundOnce = true;
        reverseDockReadyRef.current = true;
        if (coverRef.current) coverRef.current.style.display = "none";
        setReverseListDockReady(true);
        return true;
      }

      const card = findTradeMarketListDestinationCard(listingId);
      if (!card) return false;
      const measured = measureListComposition(card);
      const live = readLive();
      const hasLiveGeometry =
        live.mediaContract === "present"
          ? Boolean(measured.mediaRect && measured.mediaRect.width > 8 && measured.mediaRect.height > 8)
          : Boolean(
              (measured.priceRect && measured.priceRect.width > 8) ||
                (measured.titleRect && measured.titleRect.width > 8) ||
                (measured.metaRect && measured.metaRect.width > 8)
            );
      if (!hasLiveGeometry) return false;

      if (
        live.mediaContract === "present" &&
        measured.mediaRect &&
        frozen.media &&
        measured.mediaRect.width >= frozen.media.source.width * 0.85 &&
        measured.mediaRect.height >= frozen.media.source.height * 0.85
      ) {
        return false;
      }

      const didBind = bindTradeMarketReverseLiveDestinationTargets({
        listingId,
        mediaRect: measured.mediaRect,
        priceRect: measured.priceRect,
        titleRect: measured.titleRect,
        metaRect: measured.metaRect,
      });
      if (!didBind && !isTradeMarketReverseLiveDestinationBound(listingId, generation)) {
        return false;
      }
      reverseBoundOnce = true;
      hideDestinationCard(card);
      reverseDockReadyRef.current = true;
      if (coverRef.current) coverRef.current.style.display = "none";
      setReverseListDockReady(true);
      return true;
    };

    /** FORWARD: opacity handoff only — product stays one unit at list size. */
    const paintForward = (pRaw: number) => {
      const p = EASE(Math.min(1, Math.max(0, pRaw)));
      layoutForwardProductOnce();
      // Brief hold of coherent product, then fade product+cover to reveal real detail.
      const fade = Math.max(0, Math.min(1, (p - 0.12) / 0.88));
      const opacity = String(1 - fade);
      if (productRef.current) productRef.current.style.opacity = opacity;
      if (coverRef.current) coverRef.current.style.opacity = opacity;
    };

    /** REVERSE LOCKED: per-slot source→target dock morph. */
    const paintReverse = (pRaw: number) => {
      const p = EASE(Math.min(1, Math.max(0, pRaw)));
      const live = readLive();

      if (frozen.media && mediaRef.current) {
        const end = live.media?.target ?? frozen.media.target;
        const rect = lerpRect(frozen.media.source, end, p);
        applyBox(mediaRef.current, rect);
        mediaRef.current.style.borderRadius = `${lerp(0, 8, p)}px`;
        mediaRef.current.style.opacity = "1";
      }

      if (frozen.price && priceRef.current) {
        const target = live.price?.target ?? frozen.price.target;
        applyBox(priceRef.current, lerpRect(frozen.price.source, target, p));
        priceRef.current.style.fontSize = `${lerp(22, 15, p)}px`;
        priceRef.current.style.opacity = "1";
      }

      if (frozen.title && titleRef.current) {
        const target = live.title?.target ?? frozen.title.target;
        applyBox(titleRef.current, lerpRect(frozen.title.source, target, p));
        titleRef.current.style.fontSize = `${lerp(17, 13, p)}px`;
        titleRef.current.style.opacity = "1";
      }

      if (frozen.meta && metaRef.current) {
        const target = live.meta?.target ?? frozen.meta.target;
        applyBox(metaRef.current, lerpRect(frozen.meta.source, target, p));
        metaRef.current.style.fontSize = "12px";
        metaRef.current.style.opacity = "1";
      }
    };

    const paint = (pRaw: number) => {
      if (direction === "forward") paintForward(pRaw);
      else paintReverse(pRaw);
    };

    const destinationHandoffReady = () => {
      if (direction !== "back") return routeReady() && readLive().destinationCommitted;
      if (!routeReady()) return false;
      if (
        !reverseBoundOnce &&
        !isTradeMarketReverseLiveDestinationBound(listingId, generation) &&
        !readLive().destinationCommitted
      ) {
        return false;
      }
      const card = findTradeMarketListDestinationCard(listingId);
      if (!card) {
        return (
          readLive().destinationCommitted &&
          isMarketplaceListSurfacePath(typeof window !== "undefined" ? window.location.pathname : "")
        );
      }
      const measured = measureListComposition(card);
      return isTradeMarketReverseDestinationDocked({
        compositionMedia: readTradeMarketCompositionRect(mediaRef.current),
        compositionPrice: readTradeMarketCompositionRect(priceRef.current),
        compositionTitle: readTradeMarketCompositionRect(titleRef.current),
        liveMedia: measured.mediaRect,
        livePrice: measured.priceRect,
        liveTitle: measured.titleRect,
      });
    };

    const canFinish = () => {
      if (direction === "forward") {
        return routeReady() && readLive().destinationCommitted;
      }
      if (!reverseDockReadyRef.current || !reverseHandoffFrameRef.current) return false;
      return destinationHandoffReady();
    };

    const tick = (now: number) => {
      if (ended) return;
      const p = Math.min(1, (now - start) / TRADE_MARKET_COMPOSITION_DURATION_MS);
      paint(p);
      if (direction === "back" && reverseDockReadyRef.current) {
        reverseHandoffFrameRef.current = true;
      }
      if (p < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (canFinish()) {
        finish();
        return;
      }
      poll = window.setInterval(() => {
        paint(1);
        if (direction === "back" && reverseDockReadyRef.current) {
          reverseHandoffFrameRef.current = true;
        }
        if (canFinish()) {
          if (poll != null) window.clearInterval(poll);
          poll = null;
          finish();
        }
      }, 32);
      forceEnd = window.setTimeout(() => {
        if (poll != null) window.clearInterval(poll);
        poll = null;
        finish();
      }, direction === "back" ? 2_000 : 1_500);
    };

    const startForwardFlight = () => {
      if (forwardFlightStarted || ended) return;
      if (!readLive().destinationCommitted) return;
      if (!routeReady()) return;
      forwardFlightStarted = true;
      if (forceEnd != null) {
        window.clearTimeout(forceEnd);
        forceEnd = null;
      }
      setSlotsArmed(true);
      requestAnimationFrame(() => {
        if (ended) return;
        layoutForwardProductOnce();
        start = performance.now();
        paint(0);
        raf = requestAnimationFrame(tick);
      });
    };

    const startReverseFlight = () => {
      if (reverseFlightStarted || ended) return;
      if (!readLive().destinationCommitted) return;
      reverseFlightStarted = true;
      reverseHandoffFrameRef.current = false;
      if (forceEnd != null) {
        window.clearTimeout(forceEnd);
        forceEnd = null;
      }
      setSlotsArmed(true);
      requestAnimationFrame(() => {
        if (ended) return;
        start = performance.now();
        paint(0);
        raf = requestAnimationFrame(tick);
      });
    };

    if (direction === "back") {
      reverseDockReadyRef.current = Boolean(readLive().destinationCommitted);
      reverseHandoffFrameRef.current = false;
      if (!readLive().destinationCommitted) {
        // Missing retained destination is architecture failure — fail closed, no timeout escape.
        finish();
        return () => {
          ended = true;
        };
      }
      const waitPrepare = () => {
        if (ended) return;
        prepareReverseDestinationOnce();
        // never cover-only wait
        startReverseFlight();
      };
      raf = requestAnimationFrame(waitPrepare);
    } else {
      // Forward: detail ready (destinationCommitted) gates handoff — not a media hero dock target.
      const waitCommit = () => {
        if (ended) return;
        if (readLive().destinationCommitted && routeReady()) {
          startForwardFlight();
          return;
        }
        raf = requestAnimationFrame(waitCommit);
      };
      forceEnd = window.setTimeout(() => {
        if (ended || forwardFlightStarted) return;
        finish();
      }, 4_000);
      raf = requestAnimationFrame(waitCommit);
    }

    return () => {
      ended = true;
      if (raf) cancelAnimationFrame(raf);
      if (poll != null) window.clearInterval(poll);
      if (forceEnd != null) window.clearTimeout(forceEnd);
      restoreDestinationCard();
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
    return null;
  }

  const showSlots = slotsArmed;
  // Forward: cover fades with product handoff (not a mask over media morph).
  const showCover = session.direction === "forward" && showSlots;

  return (
    <div
      ref={portalRootRef}
      className="pointer-events-none fixed inset-0 z-[60]"
      data-trade-product-composition="1"
      data-trade-product-composition-direction={session.direction}
      data-trade-product-composition-listing={session.listingId}
      data-trade-product-composition-generation={String(session.generation)}
      data-trade-product-composition-duration-ms={String(TRADE_MARKET_COMPOSITION_DURATION_MS)}
      data-trade-product-composition-mode={mediaContract === "present" ? "with-media" : "content-only"}
      data-trade-product-composition-media-contract={mediaContract}
      data-trade-product-composition-media-paint-ready="1"
      data-trade-product-composition-destination-committed={session.destinationCommitted ? "1" : "0"}
      data-trade-product-composition-destination-dock={reverseListDockReady ? "1" : "0"}
      data-trade-product-composition-forward-model={isForward ? "product-handoff" : "reverse-dock"}
      data-trade-product-composition-reverse-bind-count={
        session.direction === "back" ? String(peekTradeMarketReverseLiveBindCount()) : "0"
      }
      aria-hidden
    >
      {showCover ? (
        <div
          ref={coverRef}
          className="absolute inset-0 bg-sam-app"
          data-trade-product-composition-cover="1"
        />
      ) : null}

      {/* FORWARD: ONE product composition — children in flow, fixed list size, opacity handoff only */}
      {showSlots && isForward ? (
        <div
          ref={productRef}
          data-trade-product-composition-product="1"
          className="absolute left-0 top-0 flex flex-col gap-1 will-change-opacity"
          style={{ opacity: 1 }}
        >
          {frozen.media ? (
            <div
              ref={mediaRef}
              data-trade-product-composition-slot="media"
              data-trade-product-composition-media-contract="present"
              className="overflow-hidden"
              style={{
                width: frozen.media.source.width,
                height: frozen.media.source.height,
                borderRadius: 8,
              }}
            >
              <img
                src={frozen.media.url}
                alt=""
                draggable={false}
                className="pointer-events-none h-full w-full object-cover"
                decoding="sync"
              />
            </div>
          ) : null}
          {frozen.price ? (
            <div
              ref={priceRef}
              data-trade-product-composition-slot="price"
              className="overflow-hidden font-semibold leading-tight text-sam-fg"
              style={{ fontSize: 15 }}
            >
              {frozen.price.text}
            </div>
          ) : null}
          {frozen.title ? (
            <div
              ref={titleRef}
              data-trade-product-composition-slot="title"
              className="overflow-hidden leading-tight text-sam-fg"
              style={{ fontSize: 13 }}
            >
              {frozen.title.text}
            </div>
          ) : null}
          {frozen.meta ? (
            <div
              ref={metaRef}
              data-trade-product-composition-slot="meta"
              className="overflow-hidden leading-tight text-sam-muted"
              style={{ fontSize: 12 }}
            >
              {frozen.meta.text}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* REVERSE: LOCKED independent slot morph (not used for forward) */}
      {showSlots && !isForward && frozen.media ? (
        <div
          ref={mediaRef}
          data-trade-product-composition-slot="media"
          data-trade-product-composition-media-contract="present"
          className="absolute left-0 top-0 overflow-hidden will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          <img
            src={frozen.media.url}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
            decoding="sync"
          />
        </div>
      ) : null}

      {showSlots && !isForward && frozen.price ? (
        <div
          ref={priceRef}
          data-trade-product-composition-slot="price"
          className="absolute left-0 top-0 overflow-hidden font-semibold leading-tight text-sam-fg will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {frozen.price.text}
        </div>
      ) : null}

      {showSlots && !isForward && frozen.title ? (
        <div
          ref={titleRef}
          data-trade-product-composition-slot="title"
          className="absolute left-0 top-0 overflow-hidden leading-tight text-sam-fg will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {frozen.title.text}
        </div>
      ) : null}

      {showSlots && !isForward && frozen.meta ? (
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
