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
  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const coverRef = useRef<HTMLDivElement | null>(null);
  const hiddenDestinationRef = useRef<HTMLElement | null>(null);
  const reverseDockReadyRef = useRef(false);
  const reverseHandoffFrameRef = useRef(false);

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
  // Reverse: once live list destination card exists, drop full-screen cover (D4).
  const [reverseListDockReady, setReverseListDockReady] = useState(false);
  /** Slots mount only when a real destination is committed and flight is about to paint. */
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
    // Hide only the destination card so the grid can own the screen without duplicate product.
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
        // Retained destination: fly while route settles — do not require list path first.
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

      // Retained list session already committed destination at arm time.
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

      // IMAGE: refuse binding a detail-sized "list" rect (would keep unnecessary enlarge).
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
        const target = live.price?.target ?? frozen.price.target;
        applyBox(priceRef.current, lerpRect(frozen.price.source, target, p));
        const fs = direction === "forward" ? lerp(15, 22, p) : lerp(22, 15, p);
        priceRef.current.style.fontSize = `${fs}px`;
        priceRef.current.style.opacity = "1";
      }

      if (frozen.title && titleRef.current) {
        const target = live.title?.target ?? frozen.title.target;
        applyBox(titleRef.current, lerpRect(frozen.title.source, target, p));
        const fs = direction === "forward" ? lerp(13, 17, p) : lerp(17, 13, p);
        titleRef.current.style.fontSize = `${fs}px`;
        titleRef.current.style.opacity = "1";
      }

      if (frozen.meta && metaRef.current) {
        const target = live.meta?.target ?? frozen.meta.target;
        applyBox(metaRef.current, lerpRect(frozen.meta.source, target, p));
        metaRef.current.style.fontSize = "12px";
        metaRef.current.style.opacity = "1";
      }
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
        // Retained destination: list surface ready is enough for handoff (card may paint next frame).
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
      if (direction !== "back") return destinationHandoffReady();
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
        // Never leave an oversized undocked composition on screen.
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
      // Retained destination: arm slots immediately — never cover-only wait.
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
        startReverseFlight();
      };
      raf = requestAnimationFrame(waitPrepare);
    } else {
      // Forward: wait until detail photos (or text) publish commits real end rect.
      const waitCommit = () => {
        if (ended) return;
        if (readLive().destinationCommitted && routeReady()) {
          startForwardFlight();
          return;
        }
        raf = requestAnimationFrame(waitCommit);
      };
      // Forward paint-ready bound only — not missing-destination escape.
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
    // HOLD: session armed but composition does not own the screen yet.
    return null;
  }

  const showSlots = slotsArmed;
  // Reverse: never mount a full-screen cover as sole owner (white-screen root).
  // Forward: cover only while composition slots are already painting.
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

      {showSlots && frozen.media ? (
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

      {showSlots && frozen.price ? (
        <div
          ref={priceRef}
          data-trade-product-composition-slot="price"
          className="absolute left-0 top-0 overflow-hidden font-semibold leading-tight text-sam-fg will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {frozen.price.text}
        </div>
      ) : null}

      {showSlots && frozen.title ? (
        <div
          ref={titleRef}
          data-trade-product-composition-slot="title"
          className="absolute left-0 top-0 overflow-hidden leading-tight text-sam-fg will-change-transform"
          style={{ transformOrigin: "top left" }}
        >
          {frozen.title.text}
        </div>
      ) : null}

      {showSlots && frozen.meta ? (
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
