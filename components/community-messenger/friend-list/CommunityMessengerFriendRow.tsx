"use client";

import { Star } from "lucide-react";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
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
      className="flex w-full min-h-[64px] max-h-[76px] items-center gap-3 border-b border-sam-border px-3 py-2 text-left transition-transform duration-100 active:scale-[0.98] disabled:opacity-50"
    >
      <SamarketUserAvatarThumb avatarUrl={row.avatarUrl} size={48} roundedClassName="rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate sam-text-body font-semibold text-sam-fg">{row.displayName}</p>
          {row.isFavorite ? <Star className="h-3.5 w-3.5 shrink-0 fill-sam-primary text-sam-primary" aria-hidden /> : null}
          <CommunityMessengerFriendStatusBadge
            labelKey={row.statusBadgeKey}
            color={row.statusBadgeColor}
            filled={row.status === "new_friend"}
          />
        </div>
        {row.publicId ? (
          <p className="truncate sam-text-helper text-sam-fg-muted">@{row.publicId}</p>
        ) : row.subtitle ? (
          <p className="truncate sam-text-helper text-sam-fg-muted">{row.subtitle}</p>
        ) : null}
      </div>
    </button>
  );
}
