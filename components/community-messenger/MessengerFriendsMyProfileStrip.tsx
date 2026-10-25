"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t } = useI18n();
  const rawLabel = me?.label?.trim() || "";
  const nick = incomingCallPeerNicknameLabel(rawLabel) || rawLabel;
  const atFromLabel = rawLabel.match(/\((@[^)]+)\)/)?.[1] ?? null;
  const username = me?.subtitle?.trim() || atFromLabel || null;
  const titleName = labelFromDisplayAndUsername(nick, username) || nick || "내 프로필";
  const bioLine = me?.bio?.trim() ?? "";

  return (
    <section className="px-3 pb-3 pt-2" aria-label={t("cm_friend_my_profile_section")} data-cm-friend-my-profile="">
      <p className="mb-1.5 sam-text-helper font-semibold" style={{ color: "var(--messenger-text-secondary)" }}>
        {t("cm_friend_my_profile_section")}
      </p>
      {/* §13-3 U-2: 요약 블록 — 카드 + 그림자 + 브랜드 테두리 링 아바타 (친구 행과 구분) */}
      <div className="flex items-center gap-3 rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-3 shadow-[var(--overlay-elevation-1)]">
        <SamarketThumbnail
          src={resolveUserAvatarImageSrc(me?.avatarUrl)}
          size={52}
          roundedClassName="rounded-full"
          className="bg-[color:var(--messenger-primary-soft)] ring-2 ring-[color:var(--messenger-primary)] ring-offset-2 ring-offset-[color:var(--messenger-surface)]"
          fallbackSrc=""
          fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
              {nick || titleName}
            </span>
            <span className="shrink-0 rounded-full bg-[color:var(--messenger-primary)] px-1.5 py-px text-[11px] font-bold leading-4 text-[color:var(--sam-text-on-primary)]">
              {t("cm_friend_my_profile_badge")}
            </span>
          </p>
          {username ? (
            <p className="truncate sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
              {username.startsWith("@") ? username : `@${username}`}
            </p>
          ) : null}
          {bioLine ? (
            <p className="mt-0.5 line-clamp-2 sam-text-helper leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
              {bioLine}
            </p>
          ) : null}
        </div>
        <Link
          href={MYPAGE_PROFILE_EDIT_HREF}
          className="shrink-0 rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-2.5 py-1.5 sam-text-helper font-semibold text-[color:var(--messenger-text)] transition-[transform,background-color] duration-100 active:scale-[0.97] active:bg-[color:var(--messenger-surface-muted)]"
        >
          {t("cm_friend_my_profile_edit")}
        </Link>
      </div>
    </section>
  );
}
