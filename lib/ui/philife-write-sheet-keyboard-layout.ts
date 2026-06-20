/**
 * `/philife` 글쓰기 시트 — 모바일 키보드·visualViewport 계약.
 *
 * DO NOT: sticky header `topOffset` 부분 시트 + viewport `fixed` footer (키보드 시 폼 소실).
 *
 * 필수:
 * - `PhilifeWriteBottomSheet`: `fixed inset-0` 풀스크린 + `translate-y` 슬라이드
 * - outer shell: `paddingBottom` = keyboard inset (`useMobileKeyboardInset`)
 * - 헤더 우측 × — `exitAndClose` (초안 `blockingDraft` 시 확인)
 * - 시트 footer: `layout="sheet"` flex shrink-0, `showCancel={false}`
 */

export const PHILIFE_WRITE_SHEET_KEYBOARD_CONTRACT_ID = "philife-write-sheet-keyboard-v2" as const;

/** 풀스크린 outer — 키보드 높이만큼 하단 패딩(가용 높이 축소) */
export function philifeWriteSheetOuterPaddingStyle(keyboardInsetPx: number) {
  return {
    paddingBottom: Math.max(0, keyboardInsetPx),
  } as const;
}

/** @deprecated v2 — `philifeWriteSheetOuterPaddingStyle` */
export function philifeWriteSheetShellStyle(_topOffsetPx: number, keyboardInsetPx: number) {
  return philifeWriteSheetOuterPaddingStyle(keyboardInsetPx);
}
