"use client";

/**
 * Trade list↔detail surface coordinator.
 *
 * VISUAL OWNER = real PostDetailView root.
 * FORBIDDEN: reconstructed media/price/title/meta overlay as forward destination.
 * Navigation remains `<Link>` + App Router.
 *
 * FORWARD:
 *   Real detail mounts visible (no cover). Coordinator only settles the enter phase.
 * REVERSE (f462 / a5c29a):
 *   Retained real detail root stays authoritative until list paint-ready.
 *   Then that same root exits (fade). Underlayer is never sole owner.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  TRADE_MARKET_COMPOSITION_DURATION_MS,
  armTradeMarketProductCompositionBackFromStandingIfNeeded,
  clearTradeMarketProductCompositionIfGeneration,
  clearTradeMarketProductCompositionStanding,
  findTradeMarketListDestinationCard,
  isTradeMarketCompositionMediaOwnershipValid,
  measureListComposition,
  peekTradeDetailSurfaceRetainNode,
  peekTradeMarketProductComposition,
  peekTradeMarketProductCompositionStanding,
  releaseTradeDetailSurfaceRetain,
  retainTradeDetailSurfaceNode,
  setTradeDetailSurfacePhase,
  subscribeTradeMarketProductComposition,
  tradePostIdFromPath,
  type TradeMarketProductCompositionSession,
} from "@/lib/trade/marketplace/trade-market-product-composition";
import { isMarketplaceListSurfacePath } from "@/lib/trade/marketplace/marketplace-detail-stack-slide";

const MAX_MS = TRADE_MARKET_COMPOSITION_DURATION_MS + 2_000;

type CoordinatorPhase =
  | "idle"
  | "forward_entering"
  | "forward_settled"
  | "reverse_prepare"
  | "reverse_handoff"
  | "target";

export function TradeMarketProductCompositionHost() {
  const pathname = usePathname();
  const [session, setSession] = useState<TradeMarketProductCompositionSession | null>(null);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
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
      retainTradeDetailSurfaceNode({ listingId: standing.listingId });
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
      retainTradeDetailSurfaceNode({ listingId: fromId });
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
    const t = window.setTimeout(() => {
      clearTradeMarketProductCompositionIfGeneration(listingId, generation);
    }, MAX_MS + 4_000);
    return () => window.clearTimeout(t);
  }, [session]);

  if (!session) return null;
  if (!isTradeMarketCompositionMediaOwnershipValid(session)) return null;
  return <DetailSurfaceCoordinator session={session} />;
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

function findLiveDetailRoot(listingId: string): HTMLElement | null {
  const retained = peekTradeDetailSurfaceRetainNode();
  if (retained) return retained;
  const root = document.querySelector(
    `[data-trade-product-composition-detail-root="1"][data-trade-detail-listing="${CSS.escape(listingId)}"]`
  ) as HTMLElement | null;
  if (root) return root;
  return document.querySelector(
    '[data-trade-product-composition-detail-root="1"]'
  ) as HTMLElement | null;
}

function DetailSurfaceCoordinator({ session }: { session: TradeMarketProductCompositionSession }) {
  const [phase, setPhase] = useState<CoordinatorPhase>(
    session.direction === "forward" ? "forward_entering" : "reverse_prepare"
  );
  const phaseRef = useRef<CoordinatorPhase>(phase);

  useLayoutEffect(() => {
    const listingId = session.listingId;
    const generation = session.generation;
    const direction = session.direction;
    const mediaContract = session.mediaContract;
    let raf = 0;
    let ended = false;
    let forceEnd: number | null = null;

    const setPhaseSafe = (next: CoordinatorPhase) => {
      phaseRef.current = next;
      setPhase(next);
    };

    const finish = () => {
      if (ended) return;
      ended = true;
      if (raf) cancelAnimationFrame(raf);
      releaseTradeDetailSurfaceRetain();
      setPhaseSafe("target");
      clearTradeMarketProductCompositionIfGeneration(listingId, generation);
    };

    const readLive = () => {
      const live = peekTradeMarketProductComposition();
      return live && live.generation === generation ? live : session;
    };

    /**
     * FORWARD: real PostDetailView is already the painted owner.
     * Coordinator must not insert a reconstructed product.
     */
    const enterForward = () => {
      setPhaseSafe("forward_entering");
      const startEnter = (root: HTMLElement) => {
        setTradeDetailSurfacePhase(listingId, "entering");
        root.setAttribute("data-trade-detail-surface-phase", "entering");
        root.setAttribute("data-trade-detail-surface-owner", "post-detail-root");
        const reduced =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced) {
          setTradeDetailSurfacePhase(listingId, "settled");
          root.setAttribute("data-trade-detail-surface-phase", "settled");
          setPhaseSafe("forward_settled");
          finish();
          return;
        }
        const onEnd = (ev: AnimationEvent) => {
          if (ev.target !== root) return;
          root.removeEventListener("animationend", onEnd);
          setTradeDetailSurfacePhase(listingId, "settled");
          root.setAttribute("data-trade-detail-surface-phase", "settled");
          setPhaseSafe("forward_settled");
          finish();
        };
        root.addEventListener("animationend", onEnd);
        if (forceEnd != null) window.clearTimeout(forceEnd);
        forceEnd = window.setTimeout(() => {
          root.removeEventListener("animationend", onEnd);
          if (ended) return;
          setTradeDetailSurfacePhase(listingId, "settled");
          root.setAttribute("data-trade-detail-surface-phase", "settled");
          finish();
        }, MAX_MS);
      };
      const waitRoot = () => {
        if (ended) return;
        const root = findLiveDetailRoot(listingId);
        if (root) {
          startEnter(root);
          return;
        }
        raf = requestAnimationFrame(waitRoot);
      };
      raf = requestAnimationFrame(waitRoot);
    };

    /**
     * REVERSE: SOURCE (real detail root) remains authoritative while list prepares.
     * hide/release only at handoff after isListProductPaintReady.
     */
    const enterReversePrepare = () => {
      setPhaseSafe("reverse_prepare");
      retainTradeDetailSurfaceNode({ listingId });
      const source = peekTradeDetailSurfaceRetainNode() ?? findLiveDetailRoot(listingId);
      if (source) {
        source.setAttribute("data-trade-detail-surface-phase", "settled");
        source.setAttribute("data-trade-detail-surface-owner", "post-detail-root");
        source.style.opacity = "1";
        setTradeDetailSurfacePhase(listingId, "settled");
      }
      if (!readLive().destinationCommitted) {
        finish();
        return;
      }

      const beginHandoff = () => {
        if (ended) return;
        setPhaseSafe("reverse_handoff");
        const node = peekTradeDetailSurfaceRetainNode() ?? findLiveDetailRoot(listingId);
        if (!node) {
          finish();
          return;
        }
        setTradeDetailSurfacePhase(listingId, "exiting");
        node.setAttribute("data-trade-detail-surface-phase", "exiting");
        const onEnd = (ev: AnimationEvent) => {
          if (ev.target !== node) return;
          node.removeEventListener("animationend", onEnd);
          finish();
        };
        node.addEventListener("animationend", onEnd);
        if (forceEnd != null) window.clearTimeout(forceEnd);
        forceEnd = window.setTimeout(() => {
          node.removeEventListener("animationend", onEnd);
          if (ended) return;
          finish();
        }, MAX_MS);
      };

      const waitReady = () => {
        if (ended) return;
        const node = peekTradeDetailSurfaceRetainNode() ?? findLiveDetailRoot(listingId);
        if (node) node.style.opacity = "1";
        if (isListProductPaintReady(listingId, mediaContract)) {
          beginHandoff();
          return;
        }
        raf = requestAnimationFrame(waitReady);
      };
      raf = requestAnimationFrame(waitReady);
    };

    forceEnd = window.setTimeout(() => {
      if (ended) return;
      finish();
    }, 4_000);

    if (direction === "forward") enterForward();
    else enterReversePrepare();

    return () => {
      ended = true;
      if (raf) cancelAnimationFrame(raf);
      if (forceEnd != null) window.clearTimeout(forceEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation-scoped surface clock
  }, [session.generation]);

  return (
    <div
      className="pointer-events-none"
      data-trade-detail-surface-coordinator="1"
      data-trade-detail-surface-forward-owner="post-detail-root"
      data-trade-detail-surface-direction={session.direction}
      data-trade-detail-surface-listing={session.listingId}
      data-trade-detail-surface-generation={String(session.generation)}
      data-trade-detail-surface-phase={phase}
      data-trade-product-composition-destination-committed={session.destinationCommitted ? "1" : "0"}
      aria-hidden
    />
  );
}
