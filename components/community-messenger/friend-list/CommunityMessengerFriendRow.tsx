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
 * Telegram contacts 정렬 — 1행 `닉네임 (@아이디)` · 2행 상태 · 아바타 녹점 · 우측 즐겨찾기 표시.
 * §16 (Owner 2026-10-25): 2행 = 상대가 쓴 상태(bio)가 있으면 상태, 없으면 lastSeen/온라인 문구.
 * 접속 상태는 아바타 점으로 항상 보인다. 큰 「친구」상태 뱃지는 사용하지 않는다.
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
      className="flex w-full items-center border-b border-sam-border py-1.5 text-left transition-[transform,background-color] duration-100 active:scale-[0.99] active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-50"
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
        {row.subtitle ? (
          <p data-cm-list-preview="" data-cm-friend-status-message="" className="truncate text-sam-fg">
            {row.subtitle}
          </p>
        ) : (
          <CommunityMessengerFriendPresenceLine peerUserId={row.profileId} />
        )}
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
