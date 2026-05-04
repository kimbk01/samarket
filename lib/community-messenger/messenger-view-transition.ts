/**
 * 메신저 라우트 전환 — `document.startViewTransition` 는 **사용하지 않는다**.
 * (목록→방·인박스→거래·배달 채팅 등에서 VT 가 `router.push`/RSC 커밋을 감싸 체감 지연·브라우저 타임아웃을 유발했음.)
 *
 * 스타일 후크는 `@/app/messenger-view-transitions.css` 에 남겨 두되,
 * `html[data-sam-messenger-vt]` 는 더 이상 전환마다 설정하지 않는다.
 *
 * @see `MessengerPillarSummaryRow` · `MessengerChatListItem` — `runMessengerViewTransition(…, intent)` API 유지
 */

export type MessengerNavTransitionIntent =
  | "pillar-forward"
  | "pillar-back"
  | "room-forward"
  | "room-back";

function scheduleClearIntent(): void {
  requestAnimationFrame(() => {
    if (typeof document === "undefined") return;
    delete document.documentElement.dataset.samMessengerVt;
  });
}

/**
 * 메신저 내 `router.push` / `replace` — **즉시 실행** (의도는 로그·추적용으로만 보존).
 */
export function runMessengerViewTransition(
  navigate: () => void | Promise<void>,
  _intent: MessengerNavTransitionIntent
): void {
  const finish = () => scheduleClearIntent();
  try {
    void navigate();
  } finally {
    finish();
  }
}

/** 새 탭·보조 클릭 등으로 기본 브라우저 동작을 쓸 때 */
export function shouldSkipMessengerNavTransitionModifiers(ev: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}): boolean {
  return ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0;
}

export function messengerViewTransitionsSupported(): boolean {
  return typeof document !== "undefined" && typeof document.startViewTransition === "function";
}
