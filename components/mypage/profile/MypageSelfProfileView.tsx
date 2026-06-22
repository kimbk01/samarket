"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";
import {
  MYPAGE_PROFILE_EDIT_HREF,
} from "@/lib/mypage/mypage-profile-routes";
import type { ProfileRow } from "@/lib/profile/types";
import { Sam } from "@/lib/ui/sam-component-classes";

export function MypageSelfProfileView({ profile }: { profile: ProfileRow }) {
  const { safeT, t } = useI18n();
  const displayName = resolveDisplayName(profile) || t("mypage_comp_display_name_empty");
  const handleRaw = (profile.username ?? profile.dibay_id ?? "").trim();
  const handle = handleRaw ? formatAtUsername(handleRaw.replace(/^@/, "")) : null;
  const bio = (profile.bio ?? "").trim();
  const usernameSlug = handleRaw.toLowerCase();
  const publicHref = usernameSlug ? `/u/${encodeURIComponent(usernameSlug)}` : null;

  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <SamarketUserAvatar avatarUrl={profile.avatar_url} sizePx={96} alt="" />
      <h1 className="mt-4 max-w-full truncate text-[20px] font-bold text-sam-fg">{displayName}</h1>
      {handle ? (
        <p className="mt-1 max-w-full truncate text-[14px] text-sam-muted">{handle}</p>
      ) : null}
      <p className="mt-3 max-w-full truncate text-[14px] leading-relaxed text-sam-muted">
        {bio ||
          safeT("mypage_profile_bio_empty", {
            fallbackKo: "소개글이 없습니다",
            fallbackEn: "No bio yet",
          })}
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-2">
        {publicHref ? (
          <Link href={publicHref} className={`${Sam.btn.secondary} w-full justify-center`}>
            {safeT("mypage_view_public_profile", {
              fallbackKo: "공개 프로필 보기",
              fallbackEn: "View public profile",
            })}
          </Link>
        ) : null}
        <Link href={MYPAGE_PROFILE_EDIT_HREF} className={`${Sam.btn.primary} w-full justify-center`}>
          {safeT("mypage_settings_profile_edit", {
            fallbackKo: "프로필 수정",
            fallbackEn: "Edit profile",
          })}
        </Link>
      </div>
    </div>
  );
}
