/**
 * `/philife` 글쓰기 시트 — 모바일 키보드·visualViewport 계약.
 *
 * DO NOT:
 * - sticky header 부분 시트 + viewport `fixed` footer
 * - outer shell `paddingBottom` = keyboard inset (Android adjustResize 와 이중 보정)
 * - `useMobileKeyboardInset` on sheet shell
 * - keyboard open 시 footer `safe-bottom` 유지 (등록 버튼 ↔ 키보드 빈 공간)
 *
 * 필수 (CM room composer 동일 — `resolveCmRoomComposerBottomPaddingPx`):
 * - `PhilifeWriteBottomSheet`: `fixed inset-0` 풀스크린 + `translate-y` 슬라이드
 * - `usePhilifeWriteSheetFooterPadding`: keyboard closed → safe-bottom · open → 0 (Android) / kb px (iOS)
 * - 스크롤: `flex-1 min-h-0 overflow-y-auto` 단일 레이어
 * - footer: flex `shrink-0`, `fixed` 금지
 */

export const PHILIFE_WRITE_SHEET_KEYBOARD_CONTRACT_ID = "philife-write-sheet-keyboard-v4" as const;

export const PHILIFE_WRITE_SHEET_FOOTER_PB_VAR = "--philife-write-footer-pb" as const;

/** closed: safe-bottom · open: hook이 `--philife-write-footer-pb` 로 덮어씀 */
export const PHILIFE_WRITE_SHEET_FOOTER_PB_CLASS =
  "pb-[var(--philife-write-footer-pb,var(--safe-bottom))]" as const;

/** @deprecated v2 — outer paddingBottom 금지 */
export function philifeWriteSheetOuterPaddingStyle(_keyboardInsetPx: number) {
  return {} as const;
}

/** @deprecated v2 */
export function philifeWriteSheetShellStyle(_topOffsetPx: number, _keyboardInsetPx: number) {
  return philifeWriteSheetOuterPaddingStyle(_keyboardInsetPx);
}
