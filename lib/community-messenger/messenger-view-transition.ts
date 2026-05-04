/**
 * 메신저 라우트 전환용 View Transitions (`document.startViewTransition`).
 * `community-messenger/layout` 의 `.sam-messenger-vt-root` 에 `view-transition-name: messenger-surface` 가 있어야 한다.
 */

export type MessengerNavTransitionIntent =
  /** 인박스 → 거래/배달 묶음 */
  | "pillar-forward"
  /** 거래/배달 묶음 → 인박스 */
  | "pillar-back"
  /** 목록 → 방 */
  | "room-forward"
  /** 방 → 목록 */
  | "room-back";

function setHtmlIntent(intent: MessengerNavTransitionIntent | null): void {
  if (typeof document === "undefined") return;
  if (intent == null) {
    delete document.documentElement.dataset.samMessengerVt;
  } else {
    document.documentElement.dataset.samMessengerVt = intent;
  }
}

function scheduleClearIntent(): void {
  requestAnimationFrame(() => {
    setHtmlIntent(null);
  });
}

/**
 * 지원 브라우저에서는 VT 로 네비게이션을 감싸고, 미지원 시 즉시 `navigate()` 만 실행한다.
 */
export function runMessengerViewTransition(
  navigate: () => void | Promise<void>,
  intent: MessengerNavTransitionIntent
): void {
  setHtmlIntent(intent);
  const finish = () => scheduleClearIntent();

  const vtFn = typeof document !== "undefined" ? document.startViewTransition?.bind(document) : undefined;
  if (!vtFn) {
    try {
      void navigate();
    } finally {
      finish();
    }
    return;
  }

  try {
    const vt = vtFn(async () => {
      const maybePromise = navigate();
      if (maybePromise && typeof (maybePromise as Promise<void>).then === "function") {
        await maybePromise;
      }
      /** Next.js 라우터 커밋 후 스냅샷을 잡기 위한 짧은 지연 */
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
    });
    void vt.finished.finally(finish);
  } catch {
    try {
      void navigate();
    } finally {
      finish();
    }
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
