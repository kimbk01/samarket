"use client";

import { useEffect, useRef, type RefObject } from "react";

const SELECTED_TAB_SELECTOR = '[aria-selected="true"], .dibay-secondary-tab--active, .sam-tab--active';

/**
 * 가로 스크롤 탭 줄 — 선택 탭이 화면 밖이면 가운데로 스크롤 (크롬 S3 2026-11-02 · 감사 T-08).
 * 선택 탭이 바뀔 때만 움직인다. 첫 표시는 즉시, 이후는 부드럽게(동작 줄이기 설정이면 즉시).
 * 넘치지 않는 줄(균등 분할)은 건드리지 않는다.
 */
export function useScrollSelectedTabIntoView(trackRef: RefObject<HTMLElement | null>): void {
  const lastSelectedRef = useRef<Element | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const selected = track.querySelector<HTMLElement>(SELECTED_TAB_SELECTOR);
    if (!selected || selected === lastSelectedRef.current) return;
    const first = lastSelectedRef.current == null;
    lastSelectedRef.current = selected;
    if (track.scrollWidth <= track.clientWidth + 1) return;

    const trackRect = track.getBoundingClientRect();
    const tabRect = selected.getBoundingClientRect();
    const target = track.scrollLeft + (tabRect.left - trackRect.left) - (trackRect.width - tabRect.width) / 2;
    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: Math.max(0, target), behavior: first || reduceMotion ? "auto" : "smooth" });
  });
}
