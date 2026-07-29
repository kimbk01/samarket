"use client";

import { Star } from "lucide-react";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { formatAtUsername } from "@/lib/users/user-label";
import { CommunityMessengerFriendStatusBadge } from "@/components/community-messenger/friend-list/CommunityMessengerFriendStatusBadge";
import type { FriendListRowViewModel } from "@/lib/community-messenger/friend-list/friend-relation-presenter";

type Props = {
  row: FriendListRowViewModel;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
};

export function CommunityMessengerFriendRow({ row, onPress, onLongPress, disabled = false }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress?.();
      }}
      className="flex w-full min-h-[72px] max-h-[74px] items-center gap-3 border-b border-sam-border px-[14px] py-2 text-left transition-transform duration-100 active:scale-[0.98] disabled:opacity-50"
      data-cm-messenger-list-row=""
    >
      <SamarketUserAvatarThumb avatarUrl={row.avatarUrl} size={52} roundedClassName="rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p data-cm-list-title="" className="truncate font-semibold text-sam-fg">
            {row.displayName}
          </p>
          {row.isFavorite ? <Star className="h-3.5 w-3.5 shrink-0 fill-sam-primary text-sam-primary" aria-hidden /> : null}
          <CommunityMessengerFriendStatusBadge
            labelKey={row.statusBadgeKey}
            color={row.statusBadgeColor}
            filled={row.status === "new_friend"}
          />
        </div>
        {row.publicId ? (
          <p data-cm-list-preview="" className="truncate text-sam-fg-muted">
            {formatAtUsername(row.publicId)}
          </p>
        ) : row.subtitle ? (
          <p data-cm-list-preview="" className="truncate text-sam-fg-muted">
            {row.subtitle}
          </p>
        ) : null}
      </div>
    </button>
  );
}
