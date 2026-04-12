"use client";

import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  friend: CommunityMessengerProfileLite;
  busyFavorite: boolean;
  onRowPress: () => void;
  /** 롱프레스 — 중앙 영역만 */
  onOpenActions: () => void;
  onToggleFavorite: () => void;
};

/**
 * 모바일 친구 행 — 탭=프로필, 롱프레스=액션 시트. 좌측 별=즐겨찾기만.
 */
export function MessengerLineFriendRow({
  friend,
  busyFavorite,
  onRowPress,
  onOpenActions,
  onToggleFavorite,
}: Props) {
  const { bind, consumeClickSuppression } = useMessengerLongPress(onOpenActions);

  const avatarSrc = friend.avatarUrl?.trim() ? friend.avatarUrl.trim() : null;
  const initial = friend.label.trim().slice(0, 1) || "?";
  const secondary = friend.subtitle?.trim() || `ID · ${friend.id.slice(0, 8)}…`;

  return (
    <div className="flex min-h-[var(--ui-tap-min,48px)] items-stretch border-b border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] last:border-b-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        disabled={busyFavorite}
        className="flex w-9 shrink-0 touch-manipulation items-center justify-center active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-50"
        style={{ color: friend.isFavoriteFriend ? "var(--messenger-primary)" : "var(--messenger-text-secondary)" }}
        aria-label={friend.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기"}
        aria-pressed={friend.isFavoriteFriend}
      >
        <span className="text-[17px] leading-none">{friend.isFavoriteFriend ? "★" : "☆"}</span>
      </button>

      <div
        role="button"
        tabIndex={0}
        className="relative flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pl-0 pr-3 touch-manipulation active:bg-[color:var(--messenger-primary-soft)]"
        {...bind}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onRowPress();
          }
        }}
        onClick={() => {
          if (consumeClickSuppression()) return;
          onRowPress();
        }}
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[color:var(--messenger-primary-soft)]">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-[14px] font-semibold"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {initial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate text-[15px] font-semibold" style={{ color: "var(--messenger-text)" }}>
              {friend.label}
            </p>
            {friend.blocked ? (
              <span
                className="shrink-0 rounded-sm border border-[color:var(--messenger-divider)] px-1 py-px text-[9px] font-medium"
                style={{ color: "var(--messenger-text-secondary)" }}
              >
                차단
              </span>
            ) : null}
          </div>
          <p className="truncate text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
            {secondary}
          </p>
        </div>
      </div>
    </div>
  );
}
