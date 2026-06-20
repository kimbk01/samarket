/**
 * `/philife` 글쓰기 시트 — 모바일 키보드·visualViewport 계약.
 *
 * DO NOT: 시트 본문만 `fixed bottom-0` footer + layout viewport `bottom:0` 단독 조합
 * (iOS overlay 키보드 시 폼이 키보드 뒤로 사라짐).
 *
 * 필수:
 * - `PhilifeWriteBottomSheet` outer shell: `top` + `bottom: keyboardInset`
 * - `useAppViewportSize` 로 visualViewport 변화 시 sticky top 재측정
 * - 시트 내부 footer: `layout="sheet"` (flex shrink-0, fixed 금지)
 */

export const PHILIFE_WRITE_SHEET_KEYBOARD_CONTRACT_ID = "philife-write-sheet-keyboard-v1" as const;

/** 시트 outer shell — 키보드 inset 을 bottom 에 반영 */
export function philifeWriteSheetShellStyle(topOffsetPx: number, keyboardInsetPx: number) {
  return {
    top: topOffsetPx,
    bottom: Math.max(0, keyboardInsetPx),
  } as const;
}
