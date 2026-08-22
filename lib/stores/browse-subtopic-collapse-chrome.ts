"use client";

import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import {
  getStoreDetailAppScrollRootCached,
  invalidateStoreDetailScrollRootCache,
} from "@/lib/ui/store-detail-scroll-root";

/** 숨김 — sentinel 을 스크롤이 이 px 만큼 지나면 접힘 */
export const BROWSE_SUBTOPIC_COLLAPSE_HIDE_AFTER_PX = 4;
/** 복귀 — 접힌 뒤 sentinel 보다 이만큼 위로 올려야 펼침 (헤더 height:0 피드백·바운스 완화) */
export const BROWSE_SUBTOPIC_COLLAPSE_REVEAL_BEFORE_PX = 8;

let collapsed = false;
let sentinelEl: HTMLElement | null = null;
let scrollRootEl: HTMLElement | null = null;
let observer: IntersectionObserver | null = null;
let unsubscribeScroll: (() => void) | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function setCollapsed(next: boolean): void {
  if (collapsed === next) return;
  collapsed = next;
  notify();
}

/**
 * 스크롤 본문 좌표 기준 판정 — `getBoundingClientRect` 차이 + scrollTop 은
 * 고정 헤더(4단) height:0 으로 root.top 이 바뀌어도 scrollTop 불변 시 안정적.
 * @internal vitest
 */
export function resolveBrowseSubtopicCollapsedFromScroll(
  currentCollapsed: boolean,
  scrollTop: number,
  sentinelRelativeTop: number,
  opts?: { hideAfterPx?: number; revealBeforePx?: number }
): boolean {
  const hideAfter = opts?.hideAfterPx ?? BROWSE_SUBTOPIC_COLLAPSE_HIDE_AFTER_PX;
  const revealBefore = opts?.revealBeforePx ?? BROWSE_SUBTOPIC_COLLAPSE_REVEAL_BEFORE_PX;
  const hideAt = sentinelRelativeTop + hideAfter;
  const revealAt = sentinelRelativeTop + revealBefore;
  if (!currentCollapsed) {
    return scrollTop > hideAt;
  }
  return scrollTop > revealAt;
}

/** sentinel top in scroll-root content coordinates (header resize invariant) */
export function resolveBrowseSubtopicSentinelRelativeTop(
  rootRect: Pick<DOMRectReadOnly, "top">,
  sentinelRect: Pick<DOMRectReadOnly, "top">,
  scrollTop: number
): number {
  return sentinelRect.top - rootRect.top + scrollTop;
}

function syncCollapsedFromGeometry(): void {
  if (!sentinelEl || !scrollRootEl || typeof document === "undefined") return;
  const root = scrollRootEl;
  const scrollTop = root.scrollTop;
  const relativeTop = resolveBrowseSubtopicSentinelRelativeTop(
    root.getBoundingClientRect(),
    sentinelEl.getBoundingClientRect(),
    scrollTop
  );
  setCollapsed(resolveBrowseSubtopicCollapsedFromScroll(collapsed, scrollTop, relativeTop));
}

function teardownObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (unsubscribeScroll) {
    unsubscribeScroll();
    unsubscribeScroll = null;
  }
  scrollRootEl = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", scheduleGeometryRecheck);
    if (resizeTimer != null) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
  }
}

function scheduleGeometryRecheck(): void {
  if (typeof window === "undefined") return;
  if (resizeTimer != null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    refreshScrollRootAndObserver();
    syncCollapsedFromGeometry();
  }, 100);
}

function refreshScrollRootAndObserver(): void {
  if (!sentinelEl || typeof window === "undefined") return;
  invalidateStoreDetailScrollRootCache();
  const nextRoot = getStoreDetailAppScrollRootCached();
  if (scrollRootEl === nextRoot && observer) return;
  scrollRootEl = nextRoot;
  if (typeof IntersectionObserver === "undefined") return;
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(
    () => {
      syncCollapsedFromGeometry();
    },
    { root: scrollRootEl, threshold: [0, 1] }
  );
  observer.observe(sentinelEl);
}

function bindObserver(): void {
  if (!sentinelEl || typeof window === "undefined") return;
  teardownObserver();
  invalidateStoreDetailScrollRootCache();
  scrollRootEl = getStoreDetailAppScrollRootCached();
  refreshScrollRootAndObserver();
  syncCollapsedFromGeometry();
  unsubscribeScroll = subscribeAppShellScroll(syncCollapsedFromGeometry, { passive: true });
  window.addEventListener("resize", scheduleGeometryRecheck, { passive: true });
}

/** `/stores/browse/*` — 3단(1차 업종 탭) 접힘 단일 권한.
 * 스크롤 델타 금지 — sentinel + scroll-root 좌표 + IO 트리거 + 히스테리시스.
 */
export function registerBrowseSubtopicCollapseSentinel(el: HTMLElement | null): void {
  sentinelEl = el;
  if (el) {
    bindObserver();
    return;
  }
  teardownObserver();
}

/** primary|sub·이탈 — 강제 펼침 없이 현재 스크롤 좌표로 재판정 (깜빡임 방지) */
export function resetBrowseSubtopicCollapseChrome(): void {
  syncCollapsedFromGeometry();
}

export function subscribeBrowseSubtopicCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrowseSubtopicCollapsedSnapshot(): boolean {
  return collapsed;
}

export function getBrowseSubtopicCollapsedServerSnapshot(): boolean {
  return false;
}

/** @internal vitest */
export function resetBrowseSubtopicCollapseChromeStateForTests(): void {
  collapsed = false;
  sentinelEl = null;
  teardownObserver();
}
