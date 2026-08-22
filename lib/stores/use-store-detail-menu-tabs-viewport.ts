"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { consumeStoreDetailMenuTabsLanding } from "@/lib/dibay/store-detail-nav-intent";
import { notifyStoreDetailMenuTabsAnchored } from "@/lib/dibay/store-detail-menu-tabs-events";
import { isStoreSlugOrderMenuRoot } from "@/lib/stores/store-consumer-route";
import {
  anchorStoreDetailToMenuTabs,
  refineMenuTabsAnchor,
} from "@/lib/ui/store-detail-menu-tabs-viewport";
import { invalidateStoreDetailScrollRootCache } from "@/lib/ui/store-detail-scroll-root";
import { invalidateStoreDetailViewportMetricsCache } from "@/lib/ui/store-detail-viewport-metrics";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function runAfterFrames(frameCount: number, fn: () => void): () => void {
  let cancelled = false;
  let left = frameCount;
  const step = () => {
    if (cancelled) return;
    left -= 1;
    if (left <= 0) {
      fn();
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return () => {
    cancelled = true;
  };
}

type AnchorKind = "none" | "estimate" | "refine";

/**
 * 매장 메뉴 루트 — 탭 앵커(추정 1회 → 탭 DOM 후 보정 1회), 내부 복귀만 재앵커.
 */
export function useStoreDetailMenuTabsViewport(args: {
  pathname: string | null;
  decodedSlug: string;
  /** true 면 탭 앵커 보류 — 목록 seed·캐시 shell 이 있으면 false 로 두어 메뉴 탭을 summary 완료 전에도 준비 */
  blockMenuTabsAnchor: boolean;
  /**
   * browse `focusProduct` landing 이 스크롤 owner — category 탭 앵커 스크롤 skip.
   * paint gate 는 ready 로 두고, anchored 마크로 focus 종료 후 재앵커 점프를 막는다.
   */
  deferCategoryAnchorForFocusProduct?: boolean;
  menusLoading: boolean;
  menuTabsMeasurable: boolean;
  menuStickyMeasureRef: RefObject<HTMLDivElement | null>;
}): { menuTabsViewportReady: boolean } {
  const {
    pathname,
    decodedSlug,
    blockMenuTabsAnchor,
    deferCategoryAnchorForFocusProduct = false,
    menusLoading,
    menuTabsMeasurable,
    menuStickyMeasureRef,
  } = args;

  const [menuTabsViewportReady, setMenuTabsViewportReady] = useState(() =>
    prefersReducedMotion()
  );
  const anchoredSlugRef = useRef<string | null>(null);
  const anchorKindRef = useRef<AnchorKind>("none");

  const slugKey = decodedSlug?.trim() ?? "";
  const isMenuRoot = Boolean(slugKey && isStoreSlugOrderMenuRoot(pathname ?? "", slugKey));

  const applyMenuTabsAnchor = useCallback(
    (force: boolean) => {
      const tabsEl = menuStickyMeasureRef.current;
      const kind: AnchorKind = menuTabsMeasurable && tabsEl ? "refine" : "estimate";

      if (
        !force &&
        anchoredSlugRef.current === slugKey &&
        (anchorKindRef.current === "refine" || anchorKindRef.current === kind)
      ) {
        return;
      }

      if (kind === "refine" && tabsEl) {
        refineMenuTabsAnchor(tabsEl);
      } else {
        anchorStoreDetailToMenuTabs({ behavior: "auto" });
      }

      invalidateStoreDetailScrollRootCache();
      invalidateStoreDetailViewportMetricsCache();
      notifyStoreDetailMenuTabsAnchored();
      anchoredSlugRef.current = slugKey;
      anchorKindRef.current = kind;
      setMenuTabsViewportReady(true);
    },
    [slugKey, menuTabsMeasurable, menuStickyMeasureRef]
  );

  useLayoutEffect(() => {
    if (!isMenuRoot || !slugKey) return;
    if (deferCategoryAnchorForFocusProduct) {
      // focus landing owns viewport — mark anchored without scrolling
      void consumeStoreDetailMenuTabsLanding();
      anchoredSlugRef.current = slugKey;
      anchorKindRef.current = "refine";
      setMenuTabsViewportReady(true);
      return;
    }
    if (blockMenuTabsAnchor) return;
    applyMenuTabsAnchor(false);
  }, [
    isMenuRoot,
    blockMenuTabsAnchor,
    deferCategoryAnchorForFocusProduct,
    slugKey,
    pathname,
    menusLoading,
    menuTabsMeasurable,
    applyMenuTabsAnchor,
  ]);

  useLayoutEffect(() => {
    if (!isMenuRoot || !slugKey) return;
    if (deferCategoryAnchorForFocusProduct) return;
    if (!consumeStoreDetailMenuTabsLanding()) return;
    anchoredSlugRef.current = null;
    anchorKindRef.current = "none";
    return runAfterFrames(2, () => applyMenuTabsAnchor(true));
  }, [isMenuRoot, slugKey, pathname, deferCategoryAnchorForFocusProduct, applyMenuTabsAnchor]);

  useLayoutEffect(() => {
    if (!isMenuRoot) {
      anchoredSlugRef.current = null;
      anchorKindRef.current = "none";
      setMenuTabsViewportReady(prefersReducedMotion());
    }
  }, [isMenuRoot, slugKey]);

  return { menuTabsViewportReady };
}
