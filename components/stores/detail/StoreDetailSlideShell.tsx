"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { usePathname } from "next/navigation";
import { StoreDetailAnimatedBackProvider } from "@/lib/dibay/store-detail-animated-back-context";
import { consumeStoreDetailShellCoveredEnter } from "@/lib/dibay/store-detail-nav-intent";
import {
  decodeSlugSegment,
  isStoreSlugConsumerSubtree,
} from "@/lib/stores/store-consumer-route";
import {
  STORE_DETAIL_SLIDE_COVER_SHADOW,
  STORE_DETAIL_SLIDE_ENTER_EASING,
  STORE_DETAIL_SLIDE_EXIT_EASING,
  STORE_DETAIL_SLIDE_MS,
} from "@/lib/dibay/store-detail-page-slide";

type SlidePhase = "enter" | "enter-active" | "idle" | "exit-active";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/**
 * `/stores/[slug]` 메뉴 루트 ???�→�???�� 진입, 좌→??복�?(?�더 ?�로).
 */
function pathsUnderSameStoreSlug(prevPath: string, nextPath: string, slug: string): boolean {
  const slugDec = decodeSlugSegment(slug);
  if (!slugDec) return false;
  return (
    isStoreSlugConsumerSubtree(prevPath, slugDec) && isStoreSlugConsumerSubtree(nextPath, slugDec)
  );
}

export function StoreDetailSlideShell({
  children,
  storeSlug,
}: {
  children: ReactNode;
  storeSlug: string;
}) {
  const pathname = usePathname() ?? "";
  const reducedMotion = usePrefersReducedMotion();
  const prevPathRef = useRef<string | null>(null);
  const skipEnterRef = useRef(
    consumeStoreDetailShellCoveredEnter() ||
      (prevPathRef.current != null &&
        pathsUnderSameStoreSlug(prevPathRef.current, pathname, storeSlug))
  );
  if (prevPathRef.current !== pathname) {
    prevPathRef.current = pathname;
  }
  const [phase, setPhase] = useState<SlidePhase>(() =>
    reducedMotion || skipEnterRef.current ? "idle" : "enter"
  );
  const pendingNavRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (reducedMotion || skipEnterRef.current) {
      setPhase("idle");
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      setPhase((current) => (current === "enter" ? "enter-active" : current));
    });
    const t = window.setTimeout(() => {
      setPhase((current) => (current === "enter-active" ? "idle" : current));
    }, STORE_DETAIL_SLIDE_MS + 48);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [reducedMotion]);

  const requestAnimatedBack = useCallback(
    (navigate: () => void) => {
      if (reducedMotion) {
        navigate();
        return;
      }
      pendingNavRef.current = navigate;
      setPhase("exit-active");
    },
    [reducedMotion]
  );

  const onSurfaceTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "transform") return;
      if (phase === "exit-active" && pendingNavRef.current) {
        const nav = pendingNavRef.current;
        pendingNavRef.current = null;
        nav();
        return;
      }
      if (phase === "enter-active") {
        setPhase("idle");
      }
    },
    [phase]
  );

  useEffect(() => {
    if (phase !== "exit-active" || !pendingNavRef.current) return;
    const t = window.setTimeout(() => {
      if (!pendingNavRef.current) return;
      const nav = pendingNavRef.current;
      pendingNavRef.current = null;
      nav();
    }, STORE_DETAIL_SLIDE_MS + 80);
    return () => window.clearTimeout(t);
  }, [phase]);

  const surfaceStyle = useMemo((): CSSProperties | undefined => {
    if (reducedMotion) return undefined;
    const transitionMs = STORE_DETAIL_SLIDE_MS;
    if (phase === "enter") {
      return {
        transform: "translate3d(100%,0,0)",
        boxShadow: STORE_DETAIL_SLIDE_COVER_SHADOW,
        willChange: "transform",
      };
    }
    if (phase === "enter-active") {
      return {
        transform: "translate3d(0,0,0)",
        transition: `transform ${transitionMs}ms ${STORE_DETAIL_SLIDE_ENTER_EASING}`,
        boxShadow: STORE_DETAIL_SLIDE_COVER_SHADOW,
        willChange: "transform",
      };
    }
    if (phase === "exit-active") {
      return {
        transform: "translate3d(100%,0,0)",
        transition: `transform ${transitionMs}ms ${STORE_DETAIL_SLIDE_EXIT_EASING}`,
        boxShadow: STORE_DETAIL_SLIDE_COVER_SHADOW,
        willChange: "transform",
      };
    }
    return {
      transform: "none",
      boxShadow: "none",
      willChange: "auto",
    };
  }, [phase, reducedMotion]);

  return (
    <StoreDetailAnimatedBackProvider value={requestAnimatedBack}>
      <div
        className="relative z-[20] min-h-[100dvh] bg-white dark:bg-[#18191A]"
        style={surfaceStyle}
        onTransitionEnd={onSurfaceTransitionEnd}
        data-store-detail-slide-phase={phase}
      >
        {children}
      </div>
    </StoreDetailAnimatedBackProvider>
  );
}
