"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";

type Props = {
  me: CommunityMessengerProfileLite | null;
};

/**
 * 친구 탭 내 프로필 줄 (채팅 시안 4판 「2. 친구 탭」, Owner 「정확히 시안대로」 2026-11-10).
 * 높이 80 · 사진 56 둥근 사각(21) · 이름 17/600 · 둘째 줄 @아이디 12.5 회색 · 오른쪽 「프로필 편집」(회색 칸, 32 · 8 · 13/600).
 * 편집은 마이페이지 프로필 수정과 같은 화면.
 */
export function MessengerFriendsMyProfileStrip({ me }: Props) {
  const { t } = useI18n();
  const rawLabel = me?.label?.trim() || "";
  const nick = incomingCallPeerNicknameLabel(rawLabel) || rawLabel;
  const atFromLabel = rawLabel.match(/\((@[^)]+)\)/)?.[1] ?? null;
  const username = me?.subtitle?.trim() || atFromLabel || null;
  const handle = username ? (username.startsWith("@") ? username : `@${username}`) : null;

  return (
    <section
      className="flex h-20 items-center gap-3 px-4"
      aria-label={t("cm_friend_my_profile_section")}
      data-cm-friend-my-profile=""
    >
      <span className="inline-flex h-14 w-14 shrink-0 overflow-hidden rounded-[21px]">
        <SamarketThumbnail
          src={resolveUserAvatarImageSrc(me?.avatarUrl)}
          size={56}
          roundedClassName="rounded-[21px]"
          className="h-full w-full bg-[color:var(--cm-chat-band)]"
          fallbackSrc=""
          fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className="truncate text-[17px] font-semibold leading-[1.3]" style={{ color: "var(--cm-chat-fg)" }}>
          {nick || t("cm_friend_my_profile_section")}
        </p>
        {handle ? (
          <p data-copyable="" className="truncate text-[12.5px] leading-[1.3]" style={{ color: "var(--cm-chat-sub)" }}>
            {handle}
          </p>
        ) : null}
      </div>
      <Link
        href={MYPAGE_PROFILE_EDIT_HREF}
        className="inline-flex h-8 shrink-0 items-center rounded-[8px] bg-[color:var(--cm-chat-band)] px-[13px] text-[13px] font-semibold active:opacity-80"
        style={{ color: "var(--cm-chat-fg)" }}
      >
        {t("cm_friend_my_profile_edit")}
      </Link>
    </section>
  );
}
