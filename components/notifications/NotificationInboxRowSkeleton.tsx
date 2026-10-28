/**
 * U-C (재감사 2026-10-28): 알림 목록 로딩 — 텍스트 대신 행 모양 스켈레톤(회원·종 팝업·상세 공통).
 * 기존 화면의 스켈레톤 규칙(bg-sam-border-soft/70 · rounded-ui-rect · motion-safe:animate-pulse) 그대로.
 */
export function NotificationInboxRowSkeleton({
  rows = 3,
  label,
}: {
  rows?: number;
  /** 스크린리더용 「불러오는 중」 */
  label: string;
}) {
  return (
    <div role="status" aria-label={label} className="flex flex-col divide-y divide-sam-border/55">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-2 py-3.5">
          <span className="block h-10 w-10 shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
          <span className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
            <span className="block h-3 w-16 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <span className="block h-3.5 w-3/4 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <span className="block h-3 w-1/2 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
          </span>
        </div>
      ))}
    </div>
  );
}
