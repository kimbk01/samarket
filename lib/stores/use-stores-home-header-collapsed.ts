"use client";

import { useEffect, useState } from "react";
import { subscribeAppShellScroll } from "@/lib/layout/subscribe-app-shell-scroll";
import { getStoreDetailScrollTop } from "@/lib/ui/store-detail-scroll-root";

/** 숨김 — 이만큼 내려가면 주소줄 접힘 */
export const STORES_HOME_HEADER_COLLAPSE_HIDE_AFTER_PX = 24;
/** 복귀 — 이 위로 올라오면 다시 펼침 (히스테리시스: 접힘 높이 변화로 떨지 않게) */
export const STORES_HOME_HEADER_COLLAPSE_REVEAL_BEFORE_PX = 8;

/** @internal vitest */
export function resolveStoresHomeHeaderCollapsed(current: boolean, scrollTop: number): boolean {
  if (!current) return scrollTop > STORES_HOME_HEADER_COLLAPSE_HIDE_AFTER_PX;
  return scrollTop > STORES_HOME_HEADER_COLLAPSE_REVEAL_BEFORE_PX;
}

/**
 * 배민 미러링 — 배달 홈을 스크롤하면 주소줄만 접히고 검색창은 남는다 (2026-10-30 배민 실기).
 * 스크롤 본문 scrollTop 기준 + 히스테리시스.
 */
export function useStoresHomeHeaderCollapsed(active: boolean): boolean {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!active) {
      setCollapsed(false);
      return;
    }
    let current = false;
    const sync = () => {
      const next = resolveStoresHomeHeaderCollapsed(current, getStoreDetailScrollTop());
      if (next === current) return;
      current = next;
      setCollapsed(next);
    };
    sync();
    return subscribeAppShellScroll(sync, { passive: true, onTargetsChanged: sync });
  }, [active]);
  return collapsed;
}
