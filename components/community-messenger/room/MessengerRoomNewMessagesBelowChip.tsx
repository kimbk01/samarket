"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { messengerRoomShowsNewMessagesBelowChip } from "@/lib/community-messenger/notifications/messenger-notification-rollout";

export function MessengerRoomNewMessagesBelowChip({
  roomId,
  onJumpToLatest,
}: {
  roomId: string;
  onJumpToLatest: () => void;
}) {
  const { safeT } = useI18n();
  const rid = roomId.trim();
  const count = useMessengerRoomReaderStateStore((s) => (rid ? (s.byRoom[rid]?.pendingNewBelow ?? 0) : 0));

  if (!messengerRoomShowsNewMessagesBelowChip() || count < 1) return null;

  const label = safeT("cm_ui_new_messages_below_chip", {
    fallbackKo: `새 메시지 ${count}개`,
    fallbackEn: `${count} new message${count === 1 ? "" : "s"}`,
    vars: { count },
  });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
      <button
        type="button"
        onClick={onJumpToLatest}
        className="pointer-events-auto rounded-full border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-1.5 sam-text-helper font-semibold text-[color:var(--cm-room-text)] shadow-none active:opacity-90"
      >
        {label}
      </button>
    </div>
  );
}
