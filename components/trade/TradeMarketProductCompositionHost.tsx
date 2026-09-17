"use client";

/**
 * Sole Marketplace list↔detail PRODUCT COMPOSITION presentation coordinator.
 *
 * FORWARD:
 *   Tap → immediate FULL product surface (F_TRANSITION_ACTIVE)
 *   Detail prepares concurrently (not a visible frozen wait)
 *   isDetailProductPaintReady → F_HANDOFF → real detail owns
 * Forbidden: list-sized static hold on white; white-only hold; media lerp/hero flight.
 *
 * REVERSE (out of this CUT's change intent; keep continuity handoff, no per-slot dock):
 *   Hide detail → list-sized product → list ready → handoff.
 *
 * Navigation remains `<Link>` + App Router.
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
  findTradeMarketListDestinationCard,
  isTradeMarketCompositionMediaOwnershipValid,
  measureListComposition,
  peekTradeMarketProductComposition,
  peekTradeMarketProductCompositionStanding,
  setTradeMarketContinuityHandoffActive,
  subscribeTradeMarketProductComposition,
  tradePostIdFromPath,
  type TradeMarketCompositionRect,
  type TradeMarketProductCompositionSession,
} from "@/lib/trade/marketplace/trade-market-product-composition";
import { isMarketplaceListSurfacePath } from "@/lib/trade/marketplace/marketplace-detail-stack-slide";

const MAX_MS = TRADE_MARKET_COMPOSITION_DURATION_MS + 2_000;
const EASE = (t: number) => 1 - Math.pow(1 - t, 3.2);

type ContinuityPhase =
  | "source"
  | "transition_active"
  | "target_preparing"
  | "target_ready"
  | "handoff"
  | "target";

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

function readRect(el: Element | null): TradeMarketCompositionRect | null {
  if (!el || typeof (el as HTMLElement).getBoundingClientRect !== "function") return null;
  const r = (el as HTMLElement).getBoundingClientRect();
  if (!(r.width > 4 && r.height > 4)) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function isDetailProductPaintReady(
  listingId: string,
  mediaContract: TradeMarketProductCompositionSession["mediaContract"]
): boolean {
  if (tradePostIdFromPath(window.location.pathname) !== listingId) return false;
  const root = document.querySelector(
    '[data-trade-product-composition-detail-root="1"]'
  ) as HTMLElement | null;
  if (!root) return false;

  if (mediaContract === "present") {
    const photos = root.querySelector('[data-ui5-slot="photos"]');
    const img = photos?.querySelector("img") as HTMLImageElement | null;
    const mediaRect = readRect(photos);
    if (!mediaRect || !img) return false;
    if (!(img.complete && img.naturalWidth > 0)) return false;
  }

  const priceRect = readRect(root.querySelector('[data-ui5-slot="price"]'));
  const titleRect = readRect(root.querySelector('[data-ui5-slot="title"]'));
  if (!priceRect && !titleRect) return false;
  return true;
}

function isListProductPaintReady(
  listingId: string,
  mediaContract: TradeMarketProductCompositionSession["mediaContract"]
): boolean {
  if (!isMarketplaceListSurfacePath(window.location.pathname)) return false;
  const card = findTradeMarketListDestinationCard(listingId);
  if (!card) return false;
  const measured = measureListComposition(card);
  if (mediaContract === "present") {
    if (!measured.mediaRect || !(measured.mediaRect.width > 8 && measured.mediaRect.height > 8)) {
      return false;
    }
  } else if (
    !(
      (measured.priceRect && measured.priceRect.width > 8) ||
      (measured.titleRect && measured.titleRect.width > 8) ||
      (measured.metaRect && measured.metaRect.width > 8)
    )
  ) {
    return false;
  }
  const r = card.getBoundingClientRect();
  return r.width > 8 && r.height > 8;
}

function CompositionSurface({ session }: { session: TradeMarketProductCompositionSession }) {
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const productRef = useRef<HTMLDivElement | null>(null);
  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const underlayerRef = useRef<HTMLDivElement | null>(null);
  const hiddenDestinationRef = useRef<HTMLElement | null>(null);
  const hiddenDetailRef = useRef<HTMLElement | null>(null);
  const laidOutRef = useRef(false);
  const phaseRef = useRef<ContinuityPhase>("source");

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
  const [phase, setPhase] = useState<ContinuityPhase>("transition_active");

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

  const restoreDetail = () => {
    const detail = hiddenDetailRef.current;
    if (!detail) return;
    detail.style.visibility = "";
    detail.removeAttribute("data-trade-product-composition-detail-hidden");
    hiddenDetailRef.current = null;
  };

  const hideDetail = () => {
    const detail = document.querySelector(
      '[data-trade-product-composition-detail-root="1"]'
    ) as HTMLElement | null;
    if (!detail) return;
    if (hiddenDetailRef.current === detail) return;
    restoreDetail();
    hiddenDetailRef.current = detail;
    detail.setAttribute("data-trade-product-composition-detail-hidden", "1");
    detail.style.visibility = "hidden";
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
   * FORWARD: immediate full-viewport PRODUCT SURFACE (covers list — not list-sized hold, not blank white).
   * REVERSE: list-geometry product (unchanged for this CUT).
   * Never grows via list→hero geometric flight.
   */
  const layoutProductOnce = () => {
    if (laidOutRef.current) return;
    const root = productRef.current;
    if (!root) return;

    if (isForward) {
      const vw = typeof window !== "undefined" ? window.innerWidth : 390;
      const mediaH = Math.min(vw, Math.round(vw * 0.92));
      root.style.left = "0px";
      root.style.top = "0px";
      root.style.width = "100%";
      root.style.height = "100%";
      root.style.transform = "none";
      root.style.opacity = "1";
      root.style.background = "var(--sam-app, #fff)";
      root.style.padding = "0";
      root.style.boxSizing = "border-box";
      if (mediaRef.current && frozen.media) {
        mediaRef.current.style.width = "100%";
        mediaRef.current.style.height = `${mediaH}px`;
        mediaRef.current.style.borderRadius = "0px";
        mediaRef.current.style.transform = "none";
      }
      laidOutRef.current = true;
      return;
    }

    const mediaGeom = frozen.media?.target ?? frozen.media?.source;
    const priceGeom = frozen.price?.target ?? frozen.price?.source;
    const titleGeom = frozen.title?.target ?? frozen.title?.source;
    const metaGeom = frozen.meta?.target ?? frozen.meta?.source;
    const left = mediaGeom?.x ?? priceGeom?.x ?? titleGeom?.x ?? metaGeom?.x ?? 0;
    const top = mediaGeom?.y ?? priceGeom?.y ?? titleGeom?.y ?? metaGeom?.y ?? 0;
    const width = Math.max(
      1,
      mediaGeom?.width ?? priceGeom?.width ?? titleGeom?.width ?? metaGeom?.width ?? 180
    );
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.width = `${width}px`;
    root.style.height = "";
    root.style.transform = "none";
    root.style.opacity = "1";
    root.style.background = "";
    root.style.padding = "";
    if (mediaRef.current && mediaGeom) {
      mediaRef.current.style.width = `${mediaGeom.width}px`;
      mediaRef.current.style.height = `${mediaGeom.height}px`;
      mediaRef.current.style.transform = "none";
      mediaRef.current.style.borderRadius = "8px";
    }
    laidOutRef.current = true;
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
    let forceEnd: number | null = null;
    let handoffStarted = false;
    let start = performance.now();

    const setPhaseSafe = (next: ContinuityPhase) => {
      phaseRef.current = next;
      setPhase(next);
    };

    const finish = () => {
      if (ended) return;
      ended = true;
      if (raf) cancelAnimationFrame(raf);
      const portal = portalRootRef.current;
      if (portal) portal.style.display = "none";
      restoreDestinationCard();
      restoreDetail();
      setTradeMarketContinuityHandoffActive(false);
      setPhaseSafe("target");
      clearTradeMarketProductCompositionIfGeneration(listingId, generation);
    };

    const readLive = () => {
      const live = peekTradeMarketProductComposition();
      return live && live.generation === generation ? live : session;
    };

    const targetPaintReady = () => {
      if (direction === "forward") {
        return isDetailProductPaintReady(listingId, mediaContract);
      }
      if (!readLive().destinationCommitted) return false;
      return isListProductPaintReady(listingId, mediaContract);
    };

    const showUnderlayer = (on: boolean) => {
      if (!underlayerRef.current) return;
      // Forward: underlayer never used as waiting owner (product surface owns).
      if (direction === "forward") {
        underlayerRef.current.style.display = "none";
        underlayerRef.current.style.opacity = "0";
        return;
      }
      underlayerRef.current.style.display = on ? "block" : "none";
      underlayerRef.current.style.opacity = on ? "1" : "0";
    };

    const paintHandoff = (pRaw: number) => {
      const p = EASE(Math.min(1, Math.max(0, pRaw)));
      layoutProductOnce();
      if (productRef.current) productRef.current.style.opacity = String(1 - p);
    };

    const beginHandoff = () => {
      if (handoffStarted || ended) return;
      if (!targetPaintReady()) return;
      handoffStarted = true;
      setPhaseSafe("handoff");
      showUnderlayer(false);

      if (direction === "forward") {
        setTradeMarketContinuityHandoffActive(true);
      } else {
        restoreDestinationCard();
      }

      if (forceEnd != null) {
        window.clearTimeout(forceEnd);
        forceEnd = null;
      }
      start = performance.now();
      paintHandoff(0);
      const tick = (now: number) => {
        if (ended) return;
        const p = Math.min(1, (now - start) / TRADE_MARKET_COMPOSITION_DURATION_MS);
        paintHandoff(p);
        if (p < 1) {
          raf = requestAnimationFrame(tick);
          return;
        }
        finish();
      };
      raf = requestAnimationFrame(tick);
    };

    /**
     * FORWARD: F_TRANSITION_ACTIVE immediately (full product surface).
     * Detail prepares concurrently — waitReady must NOT freeze a list-sized card on white.
     * When paint-ready → F_HANDOFF (readiness remains final gate).
     */
    const enterForwardTransition = () => {
      setPhaseSafe("transition_active");
      showUnderlayer(false);
      layoutProductOnce();
      if (productRef.current) productRef.current.style.opacity = "1";
      setPhaseSafe("target_preparing");

      const pollReady = () => {
        if (ended || handoffStarted) return;
        // Keep full surface authoritative while preparing — still a coherent product owner, not a blank wait.
        layoutProductOnce();
        if (productRef.current) productRef.current.style.opacity = "1";
        showUnderlayer(false);

        if (targetPaintReady()) {
          setPhaseSafe("target_ready");
          beginHandoff();
          return;
        }
        raf = requestAnimationFrame(pollReady);
      };
      raf = requestAnimationFrame(pollReady);
    };

    const enterReversePrepare = () => {
      setPhaseSafe("target_preparing");
      layoutProductOnce();
      showUnderlayer(true);
      if (productRef.current) productRef.current.style.opacity = "1";
      hideDetail();
      if (!readLive().destinationCommitted) {
        finish();
        return;
      }
      const waitReady = () => {
        if (ended || handoffStarted) return;
        layoutProductOnce();
        if (productRef.current) productRef.current.style.opacity = "1";
        showUnderlayer(true);
        hideDetail();
        const card = findTradeMarketListDestinationCard(listingId);
        if (card) hideDestinationCard(card);
        if (targetPaintReady()) {
          setPhaseSafe("target_ready");
          beginHandoff();
          return;
        }
        raf = requestAnimationFrame(waitReady);
      };
      raf = requestAnimationFrame(waitReady);
    };

    forceEnd = window.setTimeout(() => {
      if (ended || handoffStarted) return;
      finish();
    }, 4_000);

    if (direction === "forward") enterForwardTransition();
    else enterReversePrepare();

    return () => {
      ended = true;
      if (raf) cancelAnimationFrame(raf);
      if (forceEnd != null) window.clearTimeout(forceEnd);
      setTradeMarketContinuityHandoffActive(false);
      restoreDestinationCard();
      restoreDetail();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation-scoped continuity clock
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

  const forwardMediaH =
    typeof window !== "undefined" ? Math.min(window.innerWidth, Math.round(window.innerWidth * 0.92)) : 360;

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
      data-trade-product-composition-forward-model="product-continuity-handoff"
      data-trade-product-composition-phase={phase}
      data-trade-product-composition-owner={
        phase === "handoff" ? "handoff" : phase === "target" ? "target" : "transition"
      }
      data-trade-product-composition-prepare={isForward ? "full-surface" : "list-pin"}
      aria-hidden
    >
      {/* Reverse-only underlayer. Forward: always hidden — product surface owns. */}
      <div
        ref={underlayerRef}
        className="absolute inset-0 bg-sam-app"
        data-trade-product-composition-underlayer="1"
        style={{ display: isForward ? "none" : "block", opacity: isForward ? 0 : 1 }}
      />

      <div
        ref={productRef}
        data-trade-product-composition-product="1"
        data-trade-product-composition-surface={isForward ? "full" : "list"}
        className={
          isForward
            ? "absolute inset-0 flex flex-col will-change-opacity bg-sam-app"
            : "absolute left-0 top-0 flex flex-col gap-1 will-change-opacity"
        }
        style={{ opacity: 1 }}
      >
        {frozen.media ? (
          <div
            ref={mediaRef}
            data-trade-product-composition-slot="media"
            data-trade-product-composition-media-contract="present"
            className="overflow-hidden"
            style={
              isForward
                ? { width: "100%", height: forwardMediaH, borderRadius: 0 }
                : {
                    width: (frozen.media.target ?? frozen.media.source).width,
                    height: (frozen.media.target ?? frozen.media.source).height,
                    borderRadius: 8,
                  }
            }
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
        <div className={isForward ? "flex flex-col gap-1 px-4 pt-3" : "contents"}>
          {frozen.price ? (
            <div
              data-trade-product-composition-slot="price"
              className="overflow-hidden font-semibold leading-tight text-sam-fg"
              style={{ fontSize: isForward ? 22 : 15 }}
            >
              {frozen.price.text}
            </div>
          ) : null}
          {frozen.title ? (
            <div
              data-trade-product-composition-slot="title"
              className="overflow-hidden leading-tight text-sam-fg"
              style={{ fontSize: isForward ? 17 : 13 }}
            >
              {frozen.title.text}
            </div>
          ) : null}
          {frozen.meta ? (
            <div
              data-trade-product-composition-slot="meta"
              className="overflow-hidden leading-tight text-sam-muted"
              style={{ fontSize: 12 }}
            >
              {frozen.meta.text}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
