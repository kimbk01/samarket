"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { philifeAppPaths } from "@domain/philife/paths";

/** 모임 그룹 채팅: `meeting_open_chat` LINE UI (레거시 `/chats` group_meeting 미사용) */
export function ChatButton({
  meetingId,
  disabled,
  reason,
  children,
}: {
  meetingId: string;
  disabled?: boolean;
  reason?: string;
  children?: ReactNode;
}) {
  const mid = String(meetingId ?? "").trim();
  if (!mid) {
    return <p className="text-[13px] text-gray-500">채팅방이 아직 연결되지 않았어요.</p>;
  }
  if (disabled) {
    return reason ? <p className="text-[13px] text-gray-600">{reason}</p> : null;
  }
  return (
    <Link
      href={philifeAppPaths.meetingGroupChat(mid)}
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-signature px-4 text-[16px] font-semibold text-white shadow-md active:opacity-90"
    >
      {children ?? "단톡방 입장"}
    </Link>
  );
}
