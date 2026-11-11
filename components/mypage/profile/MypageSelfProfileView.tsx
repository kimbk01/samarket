"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { resolveMemberPublicIdUi } from "@/lib/auth/member-public-id-ui-contract";
import { resolveMypageSelfDisplayName } from "@/lib/mypage/mypage-self-display-name";
import { MYPAGE_PROFILE_EDIT_SHEET_HREF } from "@/lib/mypage/mypage-profile-routes";
import type { ProfileRow } from "@/lib/profile/types";
import { Sam } from "@/lib/ui/sam-component-classes";

export function MypageSelfProfileView({ profile }: { profile: ProfileRow }) {
  const { safeT, t } = useI18n();
  const displayName = resolveMypageSelfDisplayName(profile) || t("mypage_comp_display_name_empty");
  /** 회원 아이디 1개 · 친구가 나를 찾는 방법 — 단일 계약 (설계안 v3 §3.8) */
  const idUi = resolveMemberPublicIdUi(profile);
  const handle = idUi.atDisplay;
  const bio = (profile.bio ?? "").trim();
  /** 공개 프로필 주소 = 회원 아이디 (`/u/[username]` 은 dibay_id 로 찾는다) */
  const publicHref = idUi.id ? `/u/${encodeURIComponent(idUi.id)}` : null;

  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <SamarketUserAvatar avatarUrl={profile.avatar_url} sizePx={96} alt="" />
      <h1 className="mt-4 max-w-full truncate text-[20px] font-bold text-sam-fg">{displayName}</h1>
      {handle ? (
        <p className="mt-1 flex max-w-full flex-wrap items-center justify-center gap-2 text-[14px] text-sam-muted">
          <span className="truncate">{handle}</span>
          {idUi.badgeKey ? <span className={Sam.badge.primary}>{t(idUi.badgeKey)}</span> : null}
        </p>
      ) : null}
      {idUi.hintKey ? (
        <p className="mt-1 max-w-full text-[12px] text-sam-muted">{t(idUi.hintKey, idUi.hintVars)}</p>
      ) : null}
      <p className="mt-3 max-w-full truncate text-[14px] leading-relaxed text-sam-muted">
        {bio ||
          safeT("mypage_profile_bio_empty")}
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-2">
        {publicHref ? (
          <Link href={publicHref} className={`${Sam.btn.secondary} w-full justify-center`}>
            {safeT("mypage_view_public_profile")}
          </Link>
        ) : null}
        <Link href={MYPAGE_PROFILE_EDIT_SHEET_HREF} className={`${Sam.btn.primary} w-full justify-center`}>
          {safeT("mypage_settings_profile_edit")}
        </Link>
      </div>
    </div>
  );
}
