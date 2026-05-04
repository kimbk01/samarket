/**
 * 메신저 라우트 전환용 View Transitions (`document.startViewTransition`).
 * `community-messenger/layout` 의 `.sam-messenger-vt-root` 에 `view-transition-name: messenger-surface` 가 있어야 한다.
 *
 * 정책: **push(forward)만 VT**, `*-back`·`prefers-reduced-motion: reduce` 는 VT 생략(즉시 navigate).
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

function isBackNavIntent(intent: MessengerNavTransitionIntent): boolean {
  return intent === "pillar-back" || intent === "room-back";
}

function prefersReducedMotionCoarse(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 지원 브라우저에서는 **forward(`pillar-forward`·`room-forward`)만** VT 로 감싼다.
 * pop/back·reduced-motion 은 VT 없이 즉시 `navigate()`.
 */
export function runMessengerViewTransition(
  navigate: () => void | Promise<void>,
  intent: MessengerNavTransitionIntent
): void {
  const finish = () => scheduleClearIntent();

  if (isBackNavIntent(intent) || prefersReducedMotionCoarse()) {
    try {
      void navigate();
    } finally {
      finish();
    }
    return;
  }

  setHtmlIntent(intent);

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
      /** Next 라우터 커밋 직후 한 프레임만 양보 — 이중 rAF는 뒤로가기 체감 지연이 커서 단일로 축소 */
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
