/**
 * `/stores/[slug]/cart` Suspense·loading 전용 — MainFeedRouteLoading(4 rows) 대신 최소 shell.
 */
export function StoreCartPageRouteFallback() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-sam-app"
      data-store-cart-route-fallback
      aria-hidden
    >
      <div className="h-12 shrink-0 border-b border-sam-border-soft bg-ui-surface" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/70" />
        <div className="h-24 animate-pulse rounded-ui-rect bg-sam-border-soft/50" />
      </div>
    </div>
  );
}
