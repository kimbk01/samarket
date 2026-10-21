/**
 * 메신저 composer 키 입력 정책 (K-1 · K-6 · K-7) — 단일 정의.
 *
 * - D3(Owner): 모바일(터치·coarse pointer 또는 Capacitor 네이티브 셸)은 **Enter = 줄바꿈**, 전송은 버튼만.
 *   데스크톱은 Enter = 전송, Shift+Enter = 줄바꿈 유지.
 * - IME 조합 중 Enter(`isComposing` 또는 Safari/구형 Android 의 keyCode 229)는 전송·선택하지 않는다.
 * - 그룹 멘션 자동완성이 열려 있으면 ↑/↓ 이동, Enter·Tab 선택, Esc 닫기.
 *
 * @see docs/dibay-messenger-full-audit-2026-10-21.md B-7 (K-1, K-6, K-7)
 */
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/** 모바일 입력 환경 — Capacitor 셸이거나 주 포인터가 coarse(터치). 터치스크린 노트북(주 포인터 fine)은 데스크톱 취급. */
export function isMessengerComposerMobileInputEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (resolveCapacitorShellPlatform()) return true;
  } catch {
    /* ignore */
  }
  try {
    return window.matchMedia?.("(pointer: coarse)").matches === true;
  } catch {
    return false;
  }
}

export type ComposerKeyLike = {
  key: string;
  shiftKey?: boolean;
  /** `nativeEvent.isComposing` */
  isComposing?: boolean;
  /** `nativeEvent.keyCode` — 229 = IME 처리 중 */
  keyCode?: number;
};

/** K-6 / K-7(S): IME 조합 중 키 이벤트 — `isComposing` 또는 keyCode 229, 또는 composition 이벤트로 추적한 상태 */
export function isComposerKeyEventComposing(e: ComposerKeyLike, compositionActive = false): boolean {
  return compositionActive || e.isComposing === true || e.keyCode === 229;
}

export type ComposerKeyAction =
  | { kind: "none" }
  | { kind: "send" }
  | { kind: "mention_move"; delta: 1 | -1 }
  | { kind: "mention_pick" }
  | { kind: "mention_close" };

export function resolveMessengerComposerKeyAction(
  e: ComposerKeyLike,
  ctx: { mobile: boolean; mentionOpen: boolean; compositionActive?: boolean }
): ComposerKeyAction {
  const composing = isComposerKeyEventComposing(e, ctx.compositionActive === true);
  const isEnter = e.key === "Enter" || e.key === "NumpadEnter";
  if (ctx.mentionOpen && !composing) {
    if (e.key === "ArrowDown") return { kind: "mention_move", delta: 1 };
    if (e.key === "ArrowUp") return { kind: "mention_move", delta: -1 };
    if ((isEnter && !e.shiftKey) || e.key === "Tab") return { kind: "mention_pick" };
    if (e.key === "Escape") return { kind: "mention_close" };
  }
  if (!isEnter) return { kind: "none" };
  if (e.shiftKey || composing) return { kind: "none" };
  // D3: 모바일 Enter 는 기본 동작(줄바꿈)
  if (ctx.mobile) return { kind: "none" };
  return { kind: "send" };
}

/** K-7: 멘션 후보 순환 이동 */
export function nextMentionActiveIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const base = Number.isFinite(current) ? Math.min(Math.max(0, Math.trunc(current)), count - 1) : 0;
  return (base + delta + count) % count;
}
