/** Shell은 유지 — main 영역만 스켈레톤 (RSC 전환 시 빈 화면 방지) */
export default function AdminRouteLoading() {
  return (
    <div className="sam-page-stack animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 max-w-[70%] rounded-ui-rect bg-sam-surface-muted" />
      <div className="h-20 rounded-ui-rect bg-sam-surface-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`kpi-${i}`} className="h-24 rounded-ui-rect bg-sam-surface-muted" />
        ))}
      </div>
      <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`row-${i}`} className="h-10 rounded-ui-rect bg-sam-surface-muted" />
        ))}
      </div>
    </div>
  );
}
