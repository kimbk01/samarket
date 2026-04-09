"use client";

export function AdminMeetingDetailPanel({ meetingId }: { meetingId: string | null }) {
  if (!meetingId) return null;
  return (
    <div className="rounded-ui-rect border border-gray-200 bg-gray-50 p-3 text-[13px] text-gray-700">
      선택된 모임: {meetingId.slice(0, 8)}… — 목록에서 종료/열기 액션을 사용하세요.
    </div>
  );
}
