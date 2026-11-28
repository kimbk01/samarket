"use client";

import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

/**
 * 라운지 글 상세 — 키보드가 열린 동안 하단 여백 보정 (실기 2026-11-28 Xiaomi: 댓글 입력칸과 키보드 사이 빈 띠 132px).
 *
 * 하단 탭은 키보드가 열리면 「보이기만」 숨고 셸 스크롤 본문 여백(`MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS`
 * = 탭 clearance + 16px)은 그대로다(`lib/layout/bottom-nav-keyboard-hide.ts` 계약). 댓글 입력칸은 글 끝 일반 칸이라
 * 스크롤 끝에서 그 여백 + 상세 하단 여백이 키보드 위에 빈 띠로 남았다.
 * → 공용 계약은 두고, 이 상세 화면만 키보드가 열린 동안(`html[data-kb-open]`) 셸 여백을 같은 크기의 음수 바깥 여백으로
 * 상쇄하고 자기 하단 여백을 0 으로 둔다 (모임 `MOIM_STICKY_FOOTER_KB_OFFSET_CLASS` 와 같은 식).
 * 셸 여백 식이 바뀌면 이 값도 같이 바꾼다 — 시험 `community-detail-keyboard.test.ts` 가 대조한다.
 */
export const COMMUNITY_DETAIL_KB_ROOT_CLASS =
  "[html[data-kb-open=true]_&]:mb-[calc(-1*(var(--app-bottom-nav-clearance)+16px))] [html[data-kb-open=true]_&]:pb-0";

/** 글 영역(`article`) 하단 여백 — 키보드가 열린 동안 0 */
export const COMMUNITY_DETAIL_KB_ARTICLE_CLASS = "[html[data-kb-open=true]_&]:pb-0";

/**
 * 키보드가 화면을 덮는 기기(iOS 앱 WKWebView)는 화면이 줄지 않으므로, 글 끝 입력칸을 키보드 위로 올릴 스크롤 공간이
 * 키보드 가림 높이만큼 필요하다. 공용 측정값 `keyboardOcclusionInset` (Android = 0 · iOS = 가림 높이)만큼만 둔다.
 * 상세 화면 전체가 키보드 측정마다 다시 그려지지 않게 이 칸만 측정을 구독한다.
 */
export function CommunityDetailKeyboardSpacer() {
  const { keyboardOpen, keyboardOcclusionInset } = useFormKeyboardViewport();
  const h = keyboardOpen ? Math.max(0, Math.round(keyboardOcclusionInset)) : 0;
  if (h <= 0) return null;
  return <div aria-hidden className="shrink-0" style={{ height: h }} />;
}
