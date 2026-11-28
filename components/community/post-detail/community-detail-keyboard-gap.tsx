"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { findNearestScrollableAncestor } from "@/lib/ui/scroll-element-into-center";

/**
 * 라운지 글 상세 — 키보드가 열린 동안 글 끝 댓글 입력칸 아래 빈 띠 제거.
 * 설계: `docs/audit/lounge-comments-2026-11-28/composer-keyboard-gap-fix-v2-design-2026-11-28.md`
 *
 * 왜: 하단 탭은 키보드가 열리면 「보이기만」 숨고 셸 스크롤 본문 여백(`MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS`
 * = 탭 clearance + 16px)은 그대로다(`lib/layout/bottom-nav-keyboard-hide.ts` 공용 계약). 입력칸이 내용 끝이라
 * 그 여백 + 상세 하단 여백(132px, Xiaomi 실측)이 키보드 위 빈 띠로 남았다.
 *
 * 되돌리는 시점이 핵심 (#701 실패 원인 — 실측 2026-11-28 18:09 PHT):
 * 키보드가 닫히면 화면이 먼저 커지고, `html[data-kb-open]`·공용 측정값은 두 프레임 늦게 바뀐다. 그 사이 여백이 접힌 채면
 * 브라우저가 스크롤 위치를 줄어든 끝으로 잘라, 여백이 돌아온 뒤 입력칸이 하단 탭 뒤에 남는다.
 * → 화면이 커지는 크기 변경 이벤트 안에서(그리기 전) 바로 되돌리고, 끝에 있었으면 되돌린 뒤에도 끝에 둔다.
 */

/** 셸 스크롤 본문 여백(탭 clearance + 16px)의 음수 — 시험 `community-detail-keyboard-gap.test.tsx` 가 셸 상수와 대조한다 */
export const COMMUNITY_DETAIL_KB_COLLAPSE_MARGIN = "calc(-1 * (var(--app-bottom-nav-clearance) + 16px))";

/** 이만큼 넘게 화면이 커지면 키보드가 닫힌 것 (Android 화면 줄어듦 방식). 주소창·작은 변화는 무시 */
export const COMMUNITY_DETAIL_KB_CLOSE_GROW_PX = 100;

export function isKeyboardCloseGrow(prevHeightPx: number, nextHeightPx: number): boolean {
  return nextHeightPx - prevHeightPx > COMMUNITY_DETAIL_KB_CLOSE_GROW_PX;
}

type Targets = { root: HTMLElement; article: HTMLElement | null };

/** 접기 — 셸 여백 상쇄 + 상세·글 영역 아래 여백 0. 키보드가 덮는 기기(iOS)는 가림 높이만큼 아래 칸 (Android 0) */
export function collapseCommunityDetailBottom(t: Targets, occlusionPx: number): void {
  t.root.style.marginBottom = COMMUNITY_DETAIL_KB_COLLAPSE_MARGIN;
  t.root.style.paddingBottom = `${Math.max(0, Math.round(occlusionPx))}px`;
  if (t.article) t.article.style.paddingBottom = "0px";
}

/** 되돌리기 — 직전에 스크롤이 끝(1px 안)이었으면 되돌린 뒤에도 끝에 둔다. 끝이 아니면 위치를 건드리지 않는다 */
export function restoreCommunityDetailBottom(t: Targets, scrollRoot: Element | null): void {
  const atEnd = scrollRoot ? scrollRoot.scrollHeight - scrollRoot.clientHeight - scrollRoot.scrollTop <= 1 : false;
  t.root.style.marginBottom = "";
  t.root.style.paddingBottom = "";
  if (t.article) t.article.style.paddingBottom = "";
  if (scrollRoot && atEnd) scrollRoot.scrollTop = scrollRoot.scrollHeight - scrollRoot.clientHeight;
}

/**
 * 상세 화면 안에 한 번 둔다. 상세 전체가 키보드 측정마다 다시 그려지지 않게 이 부품만 측정을 구독하고, 아무것도 그리지 않는다.
 */
export function CommunityDetailKeyboardGap({
  rootRef,
  articleRef,
}: {
  rootRef: RefObject<HTMLElement | null>;
  articleRef: RefObject<HTMLElement | null>;
}) {
  const { keyboardOpen, keyboardOcclusionInset } = useFormKeyboardViewport();
  const collapsedRef = useRef(false);
  const scrollRootRef = useRef<Element | null>(null);

  /** 대상·상태는 모두 ref — 렌더마다 같은 함수 */
  const restore = useCallback(() => {
    if (!collapsedRef.current) return;
    collapsedRef.current = false;
    const root = rootRef.current;
    if (root) restoreCommunityDetailBottom({ root, article: articleRef.current }, scrollRootRef.current);
  }, [rootRef, articleRef]);

  // 공용 측정값 — 열림이면 접기(가림 높이 변화도 반영), 닫힘이면 되돌리기(iOS·크기 변경이 없던 경우)
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const t: Targets = { root, article: articleRef.current };
    if (keyboardOpen) {
      if (!collapsedRef.current) scrollRootRef.current = findNearestScrollableAncestor(t.root);
      collapseCommunityDetailBottom(t, keyboardOcclusionInset);
      collapsedRef.current = true;
    } else {
      restore();
    }
  }, [keyboardOpen, keyboardOcclusionInset, rootRef, articleRef, restore]);

  // 화면이 커지는 크기 변경 이벤트 안에서 즉시 되돌림 — 잘린 스크롤 위치가 그려지기 전에 바로잡는다 (Android 키보드 닫힘)
  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastHeight = window.innerHeight;
    const onResize = () => {
      const next = window.innerHeight;
      const grew = isKeyboardCloseGrow(lastHeight, next);
      lastHeight = next;
      if (grew) restore();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [restore]);

  // 상세를 떠나면 원래대로
  useEffect(() => () => restore(), [restore]);

  return null;
}
