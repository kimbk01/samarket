/**
 * 주문 허브 loading — 전체 홈 skeleton 금지. layout pillar enter 유지.
 */
export default function DeliveryChatsLoading() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-sam-app"
      data-domain-so-customer-list="loading-shell"
      data-messenger-hub-list-scroll=""
    >
      <div className="border-b border-sam-border px-4 py-3">
        <div className="h-4 w-24 rounded bg-sam-muted/20" />
      </div>
      <div className="min-h-0 flex-1 space-y-0 overflow-hidden px-3 pt-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex min-h-[72px] items-center gap-3 border-b border-sam-border/60 py-2">
            <div className="h-12 w-12 shrink-0 rounded-ui-rect bg-sam-muted/20" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/5 rounded bg-sam-muted/20" />
              <div className="h-3 w-3/5 rounded bg-sam-muted/15" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
