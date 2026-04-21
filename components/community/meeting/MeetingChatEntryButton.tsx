"use client";

import Link from "next/link";
import { philifeAppPaths } from "@domain/philife/paths";

export function MeetingChatEntryButton({
  meetingId,
  disabled,
}: {
  meetingId: string | null;
  disabled?: boolean;
}) {
  const mid = String(meetingId ?? "").trim();
  if (!mid) return <p className="sam-text-body-secondary text-sam-muted">모임 정보가 아직 없습니다.</p>;
  if (disabled) {
    return <p className="sam-text-body-secondary text-sam-muted">종료된 모임은 입장할 수 없습니다.</p>;
  }
  return (
    <Link
      href={philifeAppPaths.meeting(mid)}
      className="inline-block rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white"
    >
      모임 보기
    </Link>
  );
}
