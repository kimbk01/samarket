"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { usePathname } from "next/navigation";
import { StoresBrowsePrimaryView } from "@/components/stores/browse/StoresBrowsePrimaryView";
import { StoreDetailPublic } from "@/components/stores/StoreDetailPublic";
import {
  deliveryConsumerStackDepth,
  isDeliveryConsumerStackPath,
} from "@/lib/stores/delivery-consumer-stack-slide";
import { isStoreConsumerDetailPath } from "@/lib/dibay/delivery-list-scroll-restore";
import { MAIN_SHELL_ROUTE_TRANSITION_MS } from "@/components/route-transition/route-transition-config";
import {
  deliveryPresentationMarkEvent,
  deliveryPresentationMarkMount,
  deliveryPresentationMarkUnmount,
  nextDeliveryBrowseInstanceId,
  nextDeliveryStoreInstanceId,
} from "@/lib/dibay/delivery-presentation-evidence";
import {
  DeliverySurfaceLifecycleProvider,
  type DeliverySurfaceLifecycleState,
} from "@/components/delivery/presentation/DeliverySurfaceLifecycle";
import { STORE_DETAIL_DATA_READY_EVENT } from "@/lib/dibay/store-detail-ready-authority";

type BrowseSpec = {
  primarySlug: string;
  initialSubSlug: string | null;
};

type ShellApi = {
  hasParkedBrowse: () => boolean;
  ensureBrowse: (spec: BrowseSpec) => void;
  shouldHostStore: () => boolean;
  noteStoreRoute: (slug: string) => void;
};

const DeliveryPresentationApiContext = createContext<ShellApi | null>(null);
const DeliveryPresentationNestContext = createContext(false);

export function useDeliveryPresentationApi(): ShellApi {
  const ctx = useContext(DeliveryPresentationApiContext);
  if (!ctx) {
    return {
      hasParkedBrowse: () => false,
      ensureBrowse: () => {},
      shouldHostStore: () => false,
      noteStoreRoute: () => {},
    };
  }
  return ctx;
}

function isBrowsePath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? "";
  return p === "/stores/browse" || p.startsWith("/stores/browse/");
}

function parseStoreSlug(pathname: string): string | null {
  if (!isStoreConsumerDetailPath(pathname)) return null;
  const p = pathname.split("?")[0] ?? "";
  const parts = p.replace(/^\/stores\//, "").split("/").filter(Boolean);
  return parts[0] ?? null;
}

type SlidePhase = "idle" | "hold_browse" | "sliding_forward" | "idle_store" | "sliding_back";

/**
 * ARCH B2 — Delivery owns browse↔store surface lifetime + local slide.
 * ONE browse instance + ONE store instance (soft). Hard store = Next children only.
 */
export function DeliveryPresentationShell({ children }: { children: ReactNode }) {
  const nested = useContext(DeliveryPresentationNestContext);
  if (nested) {
    return <>{children}</>;
  }
  return <DeliveryPresentationShellInner>{children}</DeliveryPresentationShellInner>;
}

function DeliveryPresentationShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const pathKey = pathname.split("?")[0] ?? "";
  const onBrowse = isBrowsePath(pathKey);
  const onStore = isStoreConsumerDetailPath(pathKey);
  const storeSlug = onStore ? parseStoreSlug(pathKey) : null;
  const inDelivery = isDeliveryConsumerStackPath(pathKey);

  const [browseSpec, setBrowseSpec] = useState<BrowseSpec | null>(null);
  const [slidePhase, setSlidePhase] = useState<SlidePhase>("idle");
  const [forwardAnimate, setForwardAnimate] = useState(false);
  const [backAnimate, setBackAnimate] = useState(false);
  /**
   * Soft-hosted store identity — independent of URL for exit animation.
   * Cleared only after ltr-back completes (or leave delivery).
   */
  const [hostedStoreSlug, setHostedStoreSlug] = useState<string | null>(null);

  const browseInstanceIdRef = useRef<string | null>(null);
  const storeInstanceIdRef = useRef<string | null>(null);
  const prevPathRef = useRef(pathKey);

  const softSession = Boolean(browseSpec);
  /** Prefer sticky hosted slug; fall back to URL slug on first soft-enter paint. */
  const activeStoreSlug =
    hostedStoreSlug ?? (softSession && onStore && storeSlug ? storeSlug : null);
  const showShellStore = softSession && Boolean(activeStoreSlug);

  const ensureBrowse = useCallback((spec: BrowseSpec) => {
    setBrowseSpec((prev) => {
      if (
        prev &&
        prev.primarySlug === spec.primarySlug &&
        (prev.initialSubSlug ?? null) === (spec.initialSubSlug ?? null)
      ) {
        return prev;
      }
      return spec;
    });
  }, []);

  const noteStoreRoute = useCallback((_slug: string) => {
    deliveryPresentationMarkEvent("noteStoreRoute", { slug: _slug });
  }, []);

  const api = useMemo<ShellApi>(
    () => ({
      hasParkedBrowse: () => softSession,
      ensureBrowse,
      shouldHostStore: () => softSession && onStore,
      noteStoreRoute,
    }),
    [softSession, onStore, ensureBrowse, noteStoreRoute]
  );

  useEffect(() => {
    if (inDelivery) return;
    if (browseInstanceIdRef.current) {
      deliveryPresentationMarkUnmount("browse", browseInstanceIdRef.current);
      browseInstanceIdRef.current = null;
    }
    if (storeInstanceIdRef.current) {
      deliveryPresentationMarkUnmount("store", storeInstanceIdRef.current);
      storeInstanceIdRef.current = null;
    }
    setBrowseSpec(null);
    setHostedStoreSlug(null);
    setSlidePhase("idle");
    setForwardAnimate(false);
    setBackAnimate(false);
  }, [inDelivery]);

  useEffect(() => {
    if (showShellStore) return;
    if (!storeInstanceIdRef.current) return;
    deliveryPresentationMarkUnmount("store", storeInstanceIdRef.current);
    storeInstanceIdRef.current = null;
    deliveryPresentationMarkEvent("storeReleased");
  }, [showShellStore]);

  useLayoutEffect(() => {
    const prev = prevPathRef.current;
    if (prev === pathKey) return;
    const dPrev = deliveryConsumerStackDepth(prev);
    const dNext = deliveryConsumerStackDepth(pathKey);
    prevPathRef.current = pathKey;
    deliveryPresentationMarkEvent("routeChange", { from: prev, to: pathKey });

    if (!browseSpec) {
      setHostedStoreSlug(null);
      setSlidePhase(onStore ? "idle_store" : "idle");
      return;
    }

    if (isBrowsePath(prev) && onStore && dNext > dPrev && storeSlug) {
      setForwardAnimate(false);
      setBackAnimate(false);
      setHostedStoreSlug(storeSlug);
      setSlidePhase("hold_browse");
      deliveryPresentationMarkEvent("enterStart", { slug: storeSlug });
      return;
    }

    if (isStoreConsumerDetailPath(prev) && onBrowse && dNext < dPrev) {
      setBackAnimate(false);
      setSlidePhase("sliding_back");
      deliveryPresentationMarkEvent("slideStart", { direction: "ltr-back" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setBackAnimate(true));
      });
      return;
    }

    if (onStore && storeSlug && softSession) {
      setHostedStoreSlug(storeSlug);
      setSlidePhase("idle_store");
      return;
    }

    setSlidePhase(onBrowse ? "idle" : onStore ? "idle_store" : "idle");
  }, [pathKey, browseSpec, onBrowse, onStore, storeSlug, softSession]);

  useLayoutEffect(() => {
    if (slidePhase !== "hold_browse" || !showShellStore) return;
    deliveryPresentationMarkEvent("holdBrowseForStoreReady");

    let started = false;
    const startForward = () => {
      if (started) return;
      started = true;
      deliveryPresentationMarkEvent("storeReady");
      setSlidePhase("sliding_forward");
      deliveryPresentationMarkEvent("slideStart", { direction: "rtl-forward" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setForwardAnimate(true));
      });
    };
    const startIfReady = () => {
      /**
       * Presentation waits for shell+menus only.
       * Focus land runs after slide (focus must not block presentation).
       */
      if (
        document.querySelector("[data-store-detail-data-ready='1']") ||
        document.querySelector("[data-store-detail-ready='1']")
      ) {
        startForward();
      }
    };
    const onDataReady = () => startIfReady();
    window.addEventListener(STORE_DETAIL_DATA_READY_EVENT, onDataReady);
    startIfReady();
    return () => {
      window.removeEventListener(STORE_DETAIL_DATA_READY_EVENT, onDataReady);
    };
  }, [slidePhase, showShellStore]);

  const onStoreTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform") return;
    if (slidePhase === "sliding_forward") {
      setForwardAnimate(false);
      setSlidePhase("idle_store");
      deliveryPresentationMarkEvent("slideEnd", { direction: "rtl-forward" });
      deliveryPresentationMarkEvent("browseParked");
      return;
    }
    if (slidePhase === "sliding_back") {
      setBackAnimate(false);
      setSlidePhase("idle");
      setHostedStoreSlug(null);
      deliveryPresentationMarkEvent("slideEnd", { direction: "ltr-back" });
    }
  };

  const showBrowseSurface =
    Boolean(browseSpec) &&
    (onBrowse ||
      showShellStore ||
      slidePhase === "sliding_back" ||
      slidePhase === "sliding_forward" ||
      slidePhase === "hold_browse" ||
      slidePhase === "idle_store");
  const browseSubFromUrl = browseSpec?.initialSubSlug ?? null;
  /** Soft: shell paints UI; Next children stay mounted (hidden) so router does not roll back. */
  const suppressNextChildrenPaint = (showBrowseSurface && onBrowse) || showShellStore;
  const browseLifecycle: DeliverySurfaceLifecycleState =
    slidePhase === "sliding_back" ? "entering" : onBrowse ? "active" : "parked";
  const storeLifecycle: DeliverySurfaceLifecycleState =
    slidePhase === "sliding_back"
      ? "exiting"
      : slidePhase === "idle_store"
        ? "active"
        : "entering";

  const browseStyle = useMemo((): CSSProperties => {
    if (!showBrowseSurface) return {};
    if (slidePhase === "hold_browse") {
      return { transform: "translate3d(0,0,0)", zIndex: 2 };
    }
    if (slidePhase === "sliding_forward") {
      return {
        transform: forwardAnimate ? "translate3d(-100%,0,0)" : "translate3d(0,0,0)",
        transition: forwardAnimate
          ? `transform ${MAIN_SHELL_ROUTE_TRANSITION_MS}ms cubic-bezier(0.25, 0.9, 0.35, 1)`
          : undefined,
        zIndex: 1,
      };
    }
    if (slidePhase === "idle_store" || (onStore && browseSpec && slidePhase !== "sliding_back")) {
      return {
        transform: "translate3d(0,0,0)",
        zIndex: 0,
        pointerEvents: "none",
      };
    }
    if (slidePhase === "sliding_back") {
      return { transform: "translate3d(0,0,0)", zIndex: 1 };
    }
    return { transform: "translate3d(0,0,0)", zIndex: 1 };
  }, [showBrowseSurface, slidePhase, forwardAnimate, onStore, browseSpec]);

  const storeStyle = useMemo((): CSSProperties => {
    if (!showShellStore) return {};
    if (slidePhase === "hold_browse") {
      return { transform: "translate3d(100%,0,0)", zIndex: 3 };
    }
    if (slidePhase === "sliding_forward") {
      return {
        transform: forwardAnimate ? "translate3d(0,0,0)" : "translate3d(100%,0,0)",
        transition: forwardAnimate
          ? `transform ${MAIN_SHELL_ROUTE_TRANSITION_MS}ms cubic-bezier(0.25, 0.9, 0.35, 1)`
          : undefined,
        zIndex: 3,
      };
    }
    if (slidePhase === "sliding_back") {
      return {
        transform: backAnimate ? "translate3d(100%,0,0)" : "translate3d(0,0,0)",
        transition: backAnimate
          ? `transform ${MAIN_SHELL_ROUTE_TRANSITION_MS}ms cubic-bezier(0.25, 0.9, 0.35, 1)`
          : undefined,
        zIndex: 3,
        pointerEvents: "none",
      };
    }
    return { transform: "translate3d(0,0,0)", zIndex: 2 };
  }, [showShellStore, slidePhase, forwardAnimate, backAnimate]);

  return (
    <DeliveryPresentationNestContext.Provider value={true}>
      <DeliveryPresentationApiContext.Provider value={api}>
        <div
          className="delivery-presentation-shell relative grid min-h-[100dvh] w-full min-w-0 flex-1 grid-cols-1 overflow-x-hidden"
          data-delivery-presentation-shell="1"
          data-delivery-slide-phase={slidePhase}
          data-delivery-host-store={showShellStore ? "1" : "0"}
        >
          {showBrowseSurface && browseSpec ? (
            <div
              className="relative col-start-1 row-start-1 min-h-[100dvh] w-full"
              data-delivery-surface="browse"
              data-delivery-surface-state={
                onBrowse || slidePhase === "hold_browse" || slidePhase === "sliding_back"
                  ? "active"
                  : "parked"
              }
              style={browseStyle}
              aria-hidden={!(onBrowse || slidePhase === "hold_browse" || slidePhase === "sliding_back")}
            >
              <DeliverySurfaceLifecycleProvider kind="browse" state={browseLifecycle}>
                <BrowseSurface
                  spec={browseSpec}
                  subSlug={browseSubFromUrl}
                  instanceIdRef={browseInstanceIdRef}
                />
              </DeliverySurfaceLifecycleProvider>
            </div>
          ) : null}

          {showShellStore && activeStoreSlug ? (
            <div
              className="relative col-start-1 row-start-1 min-h-[100dvh] w-full bg-white"
              data-delivery-surface="store"
              data-delivery-surface-state="active"
              style={storeStyle}
              onTransitionEnd={onStoreTransitionEnd}
            >
              <DeliverySurfaceLifecycleProvider kind="store" state={storeLifecycle}>
                <StoreSurface slug={activeStoreSlug} instanceIdRef={storeInstanceIdRef} />
              </DeliverySurfaceLifecycleProvider>
            </div>
          ) : null}

          <div
            className={
              suppressNextChildrenPaint
                ? "hidden"
                : "relative col-start-1 row-start-1 min-h-[100dvh]"
            }
            data-delivery-next-children={suppressNextChildrenPaint ? "suppressed" : "visible"}
            aria-hidden={suppressNextChildrenPaint}
          >
            {children}
          </div>
        </div>
      </DeliveryPresentationApiContext.Provider>
    </DeliveryPresentationNestContext.Provider>
  );
}

function BrowseSurface({
  spec,
  subSlug,
  instanceIdRef,
}: {
  spec: BrowseSpec;
  subSlug: string | null;
  instanceIdRef: MutableRefObject<string | null>;
}) {
  useLayoutEffect(() => {
    if (!instanceIdRef.current) {
      instanceIdRef.current = nextDeliveryBrowseInstanceId();
      deliveryPresentationMarkMount("browse", instanceIdRef.current);
    }
    /** Strict Mode remount must keep the same instance id — unmount only when shell drops browse. */
    return () => {};
  }, [instanceIdRef]);

  return (
    <div className="min-h-[100dvh] bg-sam-app dark:bg-[#18191A]">
      <StoresBrowsePrimaryView
        primarySlug={spec.primarySlug}
        initialSubSlug={subSlug ?? spec.initialSubSlug}
      />
    </div>
  );
}

function StoreSurface({
  slug,
  instanceIdRef,
}: {
  slug: string;
  instanceIdRef: MutableRefObject<string | null>;
}) {
  useLayoutEffect(() => {
    if (!instanceIdRef.current) {
      instanceIdRef.current = nextDeliveryStoreInstanceId();
      deliveryPresentationMarkMount("store", instanceIdRef.current);
    }
  }, [slug, instanceIdRef]);

  return (
    <div data-delivery-store-slug={slug}>
      <StoreDetailPublic key={slug} slug={slug} initialApiResponse={null} />
    </div>
  );
}
