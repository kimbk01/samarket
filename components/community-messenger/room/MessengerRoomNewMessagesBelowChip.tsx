"use client";

import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { messengerRolloutUsesRoomScrollHints } from "@/lib/community-messenger/notifications/messenger-notification-rollout";

export function MessengerRoomNewMessagesBelowChip({
  roomId,
  onJumpToLatest,
}: {
  roomId: string;
  onJumpToLatest: () => void;
}) {
  const rid = roomId.trim();
  const count = useMessengerRoomReaderStateStore((s) => (rid ? (s.byRoom[rid]?.pendingNewBelow ?? 0) : 0));

  if (!messengerRolloutUsesRoomScrollHints() || count < 1) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
      <button
        type="button"
        onClick={onJumpToLatest}
        className="pointer-events-auto rounded-full border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--cm-room-text)] shadow-md active:opacity-90"
      >
        새 메시지 {count}개
      </button>
    </div>
  );
}
