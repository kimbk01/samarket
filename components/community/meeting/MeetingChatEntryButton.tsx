"use client";

import Link from "next/link";

export function MeetingChatEntryButton({
  roomId,
  disabled,
}: {
  roomId: string | null;
  disabled?: boolean;
}) {
  if (!roomId) return <p className="text-[13px] text-gray-500">채팅방이 아직 없습니다.</p>;
  if (disabled) {
    return <p className="text-[13px] text-gray-500">종료된 오픈채팅은 입장할 수 없습니다.</p>;
  }
  return (
    <Link
      href={`/chats/${roomId}`}
      className="inline-block rounded-lg bg-signature px-4 py-2 text-[14px] font-medium text-white"
    >
      오픈채팅 입장
    </Link>
  );
}
