/** 스크롤·드래그 제스처 직후 브라우저 텍스트 선택 하이라이트가 남는 현상 완화 */
export function clearStuckTextSelection(): void {
  if (typeof window === "undefined") return;
  try {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed) return;
    selection.removeAllRanges();
  } catch {
    /* ignore — 일부 WebView */
  }
}
