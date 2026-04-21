"use client";

export function AdminMeetingDetailPanel({ meetingId }: { meetingId: string | null }) {
  if (!meetingId) return null;
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 sam-text-body-secondary text-sam-fg">
      선택된 모임: {meetingId.slice(0, 8)}… — 목록에서 종료/열기 액션을 사용하세요.
    </div>
  );
}
