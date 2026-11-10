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
  /** 「내 연락처」 작은 표시 (연락처 동기화 정책 #5 — 친구이면서 내 연락처에 있음). 없으면 표시 안 함 */
  contactTagLabel?: string | null;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
};

/**
 * 친구 행 (채팅 시안 4판 「2. 친구 탭」, Owner 「정확히 시안대로」 2026-11-10) — 높이 64 · 사진 44 둥근 사각(16) ·
 * 1행 이름 16/600 (이름 옆 「(@아이디)」 없음) · 2행 12.5 회색 = 상대가 쓴 상태 글 → 없으면 마지막 접속(지금 문구) → 없으면 @아이디.
 * 접속 상태는 아바타 점으로 항상 보인다. 큰 「친구」상태 뱃지는 사용하지 않는다. 우측 즐겨찾기 별은 그대로.
 */
export function CommunityMessengerFriendRow({ row, contactTagLabel = null, onPress, onLongPress, disabled = false }: Props) {
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
      className="flex w-full items-center text-left transition-[transform,background-color] duration-100 active:scale-[0.99] active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-50"
      data-cm-messenger-list-row=""
      data-cm-list-surface="friend"
    >
      <div data-cm-list-avatar-slot="" className="relative shrink-0 overflow-visible">
        <SamarketUserAvatarThumb
          avatarUrl={row.avatarUrl}
          size={44}
          roundedClassName="rounded-[16px]"
          className="h-full w-full"
        />
        <CommunityMessengerFriendPresenceDot peerUserId={row.profileId} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p data-cm-list-title="" className="flex min-w-0 items-center gap-1.5" style={{ color: "var(--cm-chat-fg)" }}>
          <span className="truncate">{row.displayName}</span>
          {contactTagLabel ? (
            <span
              className="shrink-0 rounded-full bg-[color:var(--cm-chat-band)] px-1.5 text-[11px] font-normal leading-[18px]"
              style={{ color: "var(--cm-chat-sub)" }}
              data-cm-friend-contact-tag=""
            >
              {contactTagLabel}
            </span>
          ) : null}
        </p>
        {row.subtitle ? (
          <p
            data-cm-list-preview=""
            data-cm-friend-status-message=""
            className="truncate"
            style={{ color: "var(--cm-chat-sub)" }}
          >
            {row.subtitle}
          </p>
        ) : (
          <CommunityMessengerFriendPresenceLine peerUserId={row.profileId} fallbackText={publicIdLabel} />
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
