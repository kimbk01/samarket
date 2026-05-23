declare global {
  interface Window {
    __samarketLastBottomNavRouteIntentAt?: number;
  }
}

/** 하단·다이얼 탭 전환 직후 background prefetch quiet window — `BottomNav`·다이얼 공유 */
export function markBottomNavRouteIntentForBackgroundWarm(): void {
  if (typeof window === "undefined" || typeof performance === "undefined") return;
  window.__samarketLastBottomNavRouteIntentAt = performance.now();
}

export function remainingBottomNavBackgroundPrefetchQuietMs(quietMs = 2_500): number {
  if (typeof window === "undefined" || typeof performance === "undefined") return 0;
  const last = window.__samarketLastBottomNavRouteIntentAt;
  if (typeof last !== "number" || !Number.isFinite(last)) return 0;
  return Math.max(0, quietMs - (performance.now() - last));
}
