/**
 * K-1 / D3 — Enter 전송 정책.
 * 모바일 터치·네이티브: Enter = 줄바꿈(전송은 버튼만).
 * 데스크톱(fine pointer · 비네이티브): Enter = 전송 · Shift+Enter = 줄바꿈.
 * 화면 너비로 판정하지 않는다. IME 조합 중에는 전송하지 않는다.
 */

export function resolvePreferNewlineOnEnter(input: {
  isNativePlatform: boolean;
  coarsePointer: boolean;
}): boolean {
  return Boolean(input.isNativePlatform || input.coarsePointer);
}

export function shouldSendOnEnterKey(input: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  preferNewlineOnEnter: boolean;
}): boolean {
  if (input.key !== "Enter" && input.key !== "NumpadEnter") return false;
  if (input.isComposing) return false;
  if (input.preferNewlineOnEnter) return false;
  if (input.shiftKey) return false;
  return true;
}

export function readCoarsePointerFromWindow(win: Window | null | undefined = typeof window !== "undefined" ? window : null): boolean {
  if (!win || typeof win.matchMedia !== "function") return false;
  try {
    if (win.matchMedia("(pointer: coarse)").matches) return true;
    if (win.matchMedia("(any-pointer: coarse)").matches) return true;
  } catch {
    return false;
  }
  return false;
}
