/**
 * App Router 공통 뒤로가기 규칙:
 * 1) 앱 내부 이전 화면이 있으면 history back 우선
 * 2) 외부 사이트로 나갈 가능성이 있으면 back 대신 fallbackHref 유지
 * 3) 내부 히스토리가 없거나 경로가 그대로면 fallbackHref로 이동
 */
export function runHistoryBackWithFallback(
  router: { back: () => void; push: (href: string) => void },
  fallbackHref?: string,
  delayMs = 280
): void {
  if (typeof window === "undefined") {
    if (fallbackHref) router.push(fallbackHref);
    else router.back();
    return;
  }

  if (!canUseSafeInAppHistoryBack()) {
    if (fallbackHref) router.push(fallbackHref);
    else router.back();
    return;
  }

  const before = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  router.back();
  if (!fallbackHref) return;
  window.setTimeout(() => {
    const after = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (after === before) router.push(fallbackHref);
  }, delayMs);
}

function canUseSafeInAppHistoryBack(): boolean {
  if (typeof window === "undefined") return false;

  const historyState = window.history.state as { idx?: unknown } | null;
  const historyIdx = typeof historyState?.idx === "number" ? historyState.idx : null;
  if (historyIdx != null && historyIdx > 0) {
    return true;
  }

  if (document.referrer) {
    try {
      const referrerUrl = new URL(document.referrer);
      return referrerUrl.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  return false;
}
