"use client";

import { Star } from "lucide-react";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { formatAtUsername } from "@/lib/users/user-label";
import {
  CommunityMessengerFriendPresenceDot,
  CommunityMessengerFriendPresenceLine,
} from "@/components/community-messenger/friend-list/CommunityMessengerFriendPresenceLine";
import type { FriendListRowViewModel } from "@/lib/community-messenger/friend-list/friend-relation-presenter";

type Props = {
  row: FriendListRowViewModel;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
};

/**
 * Telegram contacts 정렬 — 1행 `닉네임 (@아이디)` · 2행 lastSeen · 아바타 녹점 · 우측 즐겨찾기 표시.
 * 큰 「친구」상태 뱃지·bio 기본 2행은 사용하지 않는다.
 */
export function CommunityMessengerFriendRow({ row, onPress, onLongPress, disabled = false }: Props) {
  const publicIdLabel = row.publicId?.trim() ? formatAtUsername(row.publicId) : null;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress?.();
      }}
      className="flex w-full items-center border-b border-sam-border py-1.5 text-left transition-transform duration-100 active:scale-[0.98] disabled:opacity-50"
      data-cm-messenger-list-row=""
      data-cm-list-surface="friend"
    >
      <div data-cm-list-avatar-slot="" className="relative shrink-0 overflow-visible">
        <SamarketUserAvatarThumb
          avatarUrl={row.avatarUrl}
          size={46}
          roundedClassName="rounded-full"
          className="h-full w-full"
        />
        <CommunityMessengerFriendPresenceDot peerUserId={row.profileId} />
      </div>
      <div className="min-w-0 flex-1">
        <p data-cm-list-title="" className="truncate font-semibold text-sam-fg">
          {row.displayName}
          {publicIdLabel ? (
            <span className="ml-1.5 font-medium text-sam-fg-muted">{`(${publicIdLabel})`}</span>
          ) : null}
        </p>
        <CommunityMessengerFriendPresenceLine peerUserId={row.profileId} />
      </div>
      {row.isFavorite ? (
        <span className="shrink-0 self-center pl-1" aria-hidden>
          <Star className="h-4 w-4 fill-sam-primary text-sam-primary" />
        </span>
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
    </button>
  );
}
