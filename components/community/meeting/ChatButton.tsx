"use client";

import type { ReactNode } from "react";
import Link from "next/link";

/** 오픈채팅 그룹채팅(room_type=group_meeting) 입장 링크 — 참여 조건은 상위에서 판단 */
export function ChatButton({
  roomId,
  disabled,
  reason,
  children,
}: {
  roomId: string;
  disabled?: boolean;
  reason?: string;
  children?: ReactNode;
}) {
  if (!roomId) {
    return <p className="text-[13px] text-gray-500">채팅방이 아직 연결되지 않았어요.</p>;
  }
  if (disabled) {
    return reason ? <p className="text-[13px] text-gray-600">{reason}</p> : null;
  }
  return (
    <Link
      href={`/chats/${roomId}`}
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-signature px-4 text-[16px] font-semibold text-white shadow-md active:opacity-90"
    >
      {children ?? "오픈채팅 입장"}
    </Link>
  );
}
