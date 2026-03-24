/**
 * App Router에서 이전 클라이언트 경로로 돌아가고,
 * 히스토리가 없어 경로가 그대로면 fallbackHref로 이동합니다.
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
  const before = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  router.back();
  if (!fallbackHref) return;
  window.setTimeout(() => {
    const after = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (after === before) router.push(fallbackHref);
  }, delayMs);
}
