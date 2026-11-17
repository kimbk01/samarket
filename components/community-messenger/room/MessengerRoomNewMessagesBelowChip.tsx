"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { messengerRoomShowsNewMessagesBelowChip } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { formatUnreadBadgeCount } from "@/lib/community-messenger/room/messenger-room-first-unread";
import { resolveMessengerRoomJumpLatestFab } from "@/lib/community-messenger/room/messenger-room-reached-latest-gate";
/**
 * jump-to-latest FAB (bottom-right).
 * Remaining unread above first-unread → jump first unread once; else → latest.
 */
export function MessengerRoomNewMessagesBelowChip({
  roomId,
  remainingUnreadCount,
  onJumpToUnread,
  onJumpToLatest,
}: {
  roomId: string;
  remainingUnreadCount: number;
  onJumpToUnread: () => void;
  onJumpToLatest: () => void;
}) {
  const { safeT } = useI18n();
  const rid = roomId.trim();
  const scrollPosition = useMessengerRoomReaderStateStore((s) =>
    rid ? (s.byRoom[rid]?.scrollPosition ?? null) : null
  );
  /** PR-1 검토 #2: 진입 완료 동기화 전(위치 없음)에는 그리지 않는다 — 위치 미확정 깜빡임 방지 */
  const fab = resolveMessengerRoomJumpLatestFab({ scrollPosition, remainingUnreadCount });

  if (!messengerRoomShowsNewMessagesBelowChip() || !fab.visible) return null;

  const badge = formatUnreadBadgeCount(fab.badgeCount);
  const aria = badge
    ? safeT("cm_ui_jump_latest_unread_aria", { vars: { count: badge } })
    : safeT("cm_ui_jump_latest_aria");

  return (
    <div className="pointer-events-none absolute bottom-[calc(0.5rem+var(--safe-bottom))] right-3 z-10 sm:right-4">
      <button
        type="button"
        data-cm-jump-latest-fab="1"
        data-cm-jump-latest-badge={badge || "0"}
        data-cm-jump-latest-remaining-unread={String(remainingUnreadCount)}
        onClick={() => {
          if (remainingUnreadCount > 0) onJumpToUnread();
          else onJumpToLatest();
        }}
        aria-label={aria}
        className="pointer-events-auto relative flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] text-[color:var(--cm-room-text)] shadow-sm active:opacity-90"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {badge ? (
          <span
            data-cm-jump-latest-badge-label={badge}
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--cm-room-primary,#2AABEE)] px-1 text-[10px] font-bold leading-none text-white"
          >
            {badge}
          </span>
        ) : null}
      </button>
    </div>
  );
}
