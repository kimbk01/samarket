"use client";

import { useLayoutEffect, type RefObject } from "react";

/** 2단 탭 좌우 여백 기본값 = `--dibay-tab2-pad-x` 토큰(12px) · 밑줄 안쪽 여백 토큰(`--dibay-tab2-bar-inset`, 8px) */
const TAB2_PAD_MAX_PX = 12;
const TAB2_BAR_INSET_PX = 8;
/** 탭 사이 글자 간격이 최소 8px(좌우 4px+4px)은 남게 */
const TAB2_PAD_MIN_PX = 4;

/** 탭 좌우 여백(px) — 칸 폭·글자 폭 합·탭 수로 계산 (12px 기본, 모자라면 최소 4px) */
export function computeFitSectionTabPadPx(availPx: number, textPx: number, tabCount: number): number {
  if (tabCount <= 0) return TAB2_PAD_MAX_PX;
  /** 최소 여백으로도 한 줄에 다 안 들어가면(탭이 많은 줄) 줄이지 않는다 — 기본 여백 그대로 밀어서 본다 */
  if (availPx - textPx < TAB2_PAD_MIN_PX * 2 * tabCount) return TAB2_PAD_MAX_PX;
  return Math.max(
    TAB2_PAD_MIN_PX,
    Math.min(TAB2_PAD_MAX_PX, Math.floor((availPx - textPx) / (tabCount * 2)))
  );
}

/**
 * 2단 탭 줄(거래 「판매·둘러보기·내 근처·카테고리」·커뮤니티 주제)이 한 줄에 다 보이도록 탭 좌우 여백만 줄인다
 * (Owner 「거래 2단 Categories 잘림 수정」 2026-11-12 — 390px 영문: 탭 칸 267px < 글자 202px + 여백 96px).
 *
 * - 칸이 넉넉하면 기본 여백 12px 그대로(모양 변화 없음).
 * - 모자라면 여백을 4px 까지 줄여 모든 탭 이름이 화면 안에 들어오게 한다. 글자 크기·탭 구성은 바꾸지 않는다.
 * - 4px 로도 한 줄에 다 안 들어가면(탭이 많은 줄·아주 좁은 화면) 여백을 줄이지 않고 기본 12px 그대로 밀어서 본다
 *   (이름 자르기 없음 — 2단 탭 규칙). 커뮤니티 주제 탭(10개)이 이 경우.
 * 글자 폭은 탭 안 글자 범위로 재고, 줄·탭 크기가 바뀌면(화면 회전·언어·글꼴 로드) 다시 맞춘다.
 */
export function useFitSectionTabPadding(trackRef: RefObject<HTMLElement | null>, deps: readonly unknown[]): void {
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || typeof window === "undefined") return;

    const tabsOf = () =>
      Array.from(track.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains("dibay-secondary-tab")
      );

    let lastPad = -1;
    const apply = () => {
      const tabs = tabsOf();
      if (tabs.length === 0) return;
      const cs = window.getComputedStyle(track);
      const avail =
        track.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      let text = 0;
      const range = document.createRange();
      for (const tab of tabs) {
        range.selectNodeContents(tab);
        text += range.getBoundingClientRect().width;
      }
      text = Math.ceil(text);
      const pad = computeFitSectionTabPadPx(avail, text, tabs.length);
      if (pad === lastPad) return;
      lastPad = pad;
      track.style.setProperty("--dibay-tab2-pad-x", `${pad}px`);
      track.style.setProperty("--dibay-tab2-bar-inset", `${Math.min(TAB2_BAR_INSET_PX, pad)}px`);
    };

    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => apply()) : null;
    if (ro) {
      ro.observe(track);
      for (const tab of tabsOf()) ro.observe(tab);
    }
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) apply();
    });
    return () => {
      alive = false;
      ro?.disconnect();
      track.style.removeProperty("--dibay-tab2-pad-x");
      track.style.removeProperty("--dibay-tab2-bar-inset");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps = 탭 이름(언어) 바뀔 때 다시 붙임
  }, deps);
}
