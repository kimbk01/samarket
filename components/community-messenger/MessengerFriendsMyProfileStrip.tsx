"use client";

import Link from "next/link";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import {
  incomingCallPeerNicknameLabel,
  labelFromDisplayAndUsername,
} from "@/lib/users/user-label";

type Props = {
  me: CommunityMessengerProfileLite | null;
};

/**
 * 친구 탭 상단 — `닉네임 (@아이디)` · 나의 상태(bio) · 편집은 마이페이지 프로필 수정과 동일 데이터
 */
export function MessengerFriendsMyProfileStrip({ me }: Props) {
  const rawLabel = me?.label?.trim() || "";
  const nick = incomingCallPeerNicknameLabel(rawLabel) || rawLabel;
  const atFromLabel = rawLabel.match(/\((@[^)]+)\)/)?.[1] ?? null;
  const username = me?.subtitle?.trim() || atFromLabel || null;
  const titleName = labelFromDisplayAndUsername(nick, username) || nick || "내 프로필";
  const bioLine = me?.bio?.trim() ?? "";

  return (
    <div className="flex items-center gap-2.5 border-b border-[color:var(--messenger-divider)] bg-[color:var(--messenger-bg)] px-1 py-2">
      <SamarketThumbnail
        src={resolveUserAvatarImageSrc(me?.avatarUrl)}
        size={36}
        roundedClassName="rounded-full"
        className="bg-[color:var(--messenger-primary-soft)] ring-1 ring-[color:var(--messenger-primary-soft-2)]"
        fallbackSrc=""
        fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate sam-text-body font-semibold" style={{ color: "var(--messenger-text)" }}>
          {titleName}
        </p>
        {bioLine ? (
          <p className="mt-0.5 line-clamp-2 sam-text-helper leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {bioLine}
          </p>
        ) : null}
      </div>
      <Link
        href={MYPAGE_PROFILE_EDIT_HREF}
        className="shrink-0 rounded-[var(--messenger-radius-sm)] px-2 py-1.5 sam-text-body-secondary font-semibold text-[color:var(--messenger-primary)] active:opacity-80"
      >
        내 프로필 ›
      </Link>
    </div>
  );
}
