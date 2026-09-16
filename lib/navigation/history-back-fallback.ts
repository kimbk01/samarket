/**
 * App Router 공통 뒤로가기 규칙:
 * 1) 앱 내부 이전 화면이 있으면 history back 우선
 * 2) 외부 사이트에서 들어온 경우(document.referrer가 다른 오리진)에는 back으로 이탈하지 않고 폴백
 * 3) 리퍼러가 비어 있는 순수 클라이언트 전환 등은 history.length로 보조 판단 후 back 시도
 * 4) 내부 히스토리가 없거나 경로가 그대로면 fallbackHref로 이동
 *
 * SINGLE-ACTION:
 * - When in-app history is proven (history.state.idx > 0 or same-origin referrer),
 *   call router.back() ONLY — never arm a delayed fallback push.
 *   The previous "back + 280ms observe + push" race created a second navigation
 *   whenever soft/animated back settled after the timer (confirmed device divergence).
 * - Fallback push is reserved for uncertain history (no idx, external/empty referrer).
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

  // Proven in-app stack → one back, zero fallback navigation.
  if (canUseSafeInAppHistoryBack()) {
    router.back();
    return;
  }

  if (isReferrerExternalOrigin()) {
    if (fallbackHref) router.push(fallbackHref);
    else router.back();
    return;
  }

  const before = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  const pushFallbackIfStale = () => {
    if (!fallbackHref) return;
    let cancelled = false;
    let timer: number | null = null;
    let poll: number | null = null;

    const cleanup = () => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (poll != null) {
        window.clearInterval(poll);
        poll = null;
      }
      window.removeEventListener("popstate", onMaybeMoved);
    };

    const currentHref = () =>
      `${window.location.pathname}${window.location.search}${window.location.hash}`;

    const onMaybeMoved = () => {
      if (currentHref() !== before) {
        cancelled = true;
        cleanup();
      }
    };

    window.addEventListener("popstate", onMaybeMoved);
    poll = window.setInterval(onMaybeMoved, 32);
    timer = window.setTimeout(() => {
      const stuck = !cancelled && currentHref() === before;
      cleanup();
      if (stuck) router.push(fallbackHref);
    }, delayMs);
  };

  if (fallbackHref && window.history.length > 1) {
    router.back();
    pushFallbackIfStale();
    return;
  }

  if (fallbackHref) router.push(fallbackHref);
  else router.back();
}

function isReferrerExternalOrigin(): boolean {
  if (!document.referrer) return false;
  try {
    return new URL(document.referrer).origin !== window.location.origin;
  } catch {
    return true;
  }
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
