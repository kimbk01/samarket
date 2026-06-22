"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";
import { MYPAGE_PROFILE_HREF } from "@/lib/mypage/mypage-profile-routes";
import type { ProfileRow } from "@/lib/profile/types";

/** /mypage 상단 — 얇은 프로필 row (카드·stat·로그아웃 없음) */
export function MyInfoProfileRow({ profile }: { profile: ProfileRow }) {
  const { safeT, t } = useI18n();
  const displayName = resolveDisplayName(profile) || t("mypage_comp_display_name_empty");
  const handleRaw = (profile.username ?? profile.dibay_id ?? "").trim();
  const handle = handleRaw ? formatAtUsername(handleRaw.replace(/^@/, "")) : null;
  const bioLine = (profile.bio ?? "").trim();

  return (
    <Link
      href={MYPAGE_PROFILE_HREF}
      className="flex min-h-[56px] min-w-0 items-center gap-3 border-b border-sam-border bg-sam-surface px-4 py-3 active:bg-sam-app sm:px-5"
    >
      <SamarketUserAvatar avatarUrl={profile.avatar_url} sizePx={48} alt="" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold leading-snug text-sam-fg">{displayName}</p>
        {handle ? (
          <p className="truncate text-[13px] text-sam-muted">{handle}</p>
        ) : (
          <p className="truncate text-[13px] text-sam-muted">
            {safeT("mypage_comp_set_dibay_id", {
              fallbackKo: "아이디를 설정해 주세요",
              fallbackEn: "Set your @ ID",
            })}
          </p>
        )}
        {bioLine ? (
          <p className="mt-0.5 truncate text-[13px] text-sam-muted">{bioLine}</p>
        ) : null}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-sam-muted" aria-hidden />
    </Link>
  );
}
