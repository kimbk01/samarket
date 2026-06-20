/**
 * `/philife` 글쓰기 시트 — 모바일 키보드·visualViewport 계약.
 *
 * DO NOT:
 * - sticky header 부분 시트 + viewport `fixed` footer
 * - outer shell `paddingBottom` = keyboard inset (Android adjustResize 와 이중 보정)
 * - `useMobileKeyboardInset` on sheet shell (Android DIBAY APK 폼 소실)
 *
 * 필수 (CM room keyboard LOCK 동일):
 * - `PhilifeWriteBottomSheet`: `fixed inset-0` 풀스크린 + `translate-y` 슬라이드
 * - Android: `adjustResize` + flex column — JS keyboard layout **금지**
 * - iOS: `useCmRoomKbOffset` → panel `--kb-offset` + footer `calc(safe-bottom + kb-offset)` **한 곳만**
 * - 스크롤: `flex-1 min-h-0 overflow-y-auto` 단일 레이어 (폼 필드)
 * - footer: flex `shrink-0`, `fixed` 금지
 * - 헤더 우측 × — `exitAndClose` (초안 `blockingDraft` 시 확인)
 */

export const PHILIFE_WRITE_SHEET_KEYBOARD_CONTRACT_ID = "philife-write-sheet-keyboard-v3" as const;

/** 시트 footer — safe-bottom + iOS overlay keyboard (단일 하단 권한) */
export const PHILIFE_WRITE_SHEET_FOOTER_PB_CLASS =
  "pb-[calc(var(--safe-bottom)+var(--kb-offset,0px))]" as const;

/** @deprecated v2 — outer paddingBottom 금지. v3 는 footer `--kb-offset` only. */
export function philifeWriteSheetOuterPaddingStyle(_keyboardInsetPx: number) {
  return {} as const;
}

/** @deprecated v2 */
export function philifeWriteSheetShellStyle(_topOffsetPx: number, _keyboardInsetPx: number) {
  return philifeWriteSheetOuterPaddingStyle(_keyboardInsetPx);
}
