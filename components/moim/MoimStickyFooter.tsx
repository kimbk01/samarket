"use client";

import type { ReactNode } from "react";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";

/**
 * 키보드가 열렸을 때 하단 버튼 줄의 위치 보정.
 *
 * 모임 화면은 하단 탭 대상 경로라 셸 스크롤 본문에 `MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS`
 * (= 탭 clearance + 16px) 여백이 있고, `sticky bottom-0` 은 그 여백 위에 붙는다.
 * 키보드가 열리면 하단 탭은 「보이기만」 숨고 여백은 그대로라(`bottom-nav-keyboard-hide.ts` 계약),
 * 버튼 줄이 그 여백만큼 키보드 위로 떠서 입력칸을 가렸다(2026-11-12 Samsung 실기).
 * → 키보드 열림(`html[data-kb-open]`) 동안만 같은 여백만큼 아래로 내려 화면(키보드) 바로 위에 붙인다.
 * 셸 여백 식이 바뀌면 이 값도 같이 바꾼다 — 시험 `moim-sticky-footer.test.ts` 가 대조한다.
 */
export const MOIM_STICKY_FOOTER_KB_OFFSET_CLASS =
  "[html[data-kb-open=true]_&]:bottom-[calc(-1*(var(--app-bottom-nav-clearance)+16px))]";

/**
 * 모임 화면 하단 고정 버튼 줄 (만들기·글쓰기·댓글·프로필·일정·가입 — 모든 진입점 같은 부품).
 * 입력 키보드 계약(`docs/dibay-global-input-ux-parity-hard-lock.md`):
 * - `data-form-keyboard-footer` — 포커스한 입력칸이 이 줄 위로 보이게 스크롤(focus visibility).
 * - 아래 여백: 닫힘 = safe-bottom, 열림 = 키보드 가림 높이만(Android 0 · iOS 가림) — safe+키보드 중복 없음.
 */
export function MoimStickyFooter({
  children,
  compact = false,
  className = "",
}: {
  children: ReactNode;
  /** 댓글 입력 줄처럼 위아래를 조금 좁게 */
  compact?: boolean;
  className?: string;
}) {
  const { effectiveViewportBottom, keyboardOpen, keyboardOcclusionInset } = useFormKeyboardViewport();
  useFormKeyboardFocusVisibility({ effectiveViewportBottom });
  const base = compact ? 10 : 12;
  const occlusion = keyboardOpen ? Math.max(0, Math.round(keyboardOcclusionInset)) : 0;
  return (
    <div
      data-form-keyboard-footer="1"
      className={`sticky bottom-0 border-t border-sam-border bg-sam-surface px-4 ${compact ? "pt-2" : "pt-2.5"} ${MOIM_STICKY_FOOTER_KB_OFFSET_CLASS} ${className}`}
      style={{ paddingBottom: `calc(${base}px + var(--kb-safe-bottom, 0px) + ${occlusion}px)` }}
    >
      {children}
    </div>
  );
}
