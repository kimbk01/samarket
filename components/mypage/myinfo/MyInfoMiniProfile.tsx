"use client";

import Link from "next/link";
import { ChevronRight, Settings } from "lucide-react";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAtUsername } from "@/lib/users/user-label";
import { MYINFO_SURFACE, MYINFO_TYPO } from "./myinfo-theme";

export function MyInfoMiniProfile({
  avatarUrl,
  displayName,
  atUsername,
  publicProfileHref,
  onSettingsPress,
  rightMetaSlot,
}: {
  avatarUrl: string | null;
  displayName: string;
  atUsername?: string | null;
  publicProfileHref?: string | null;
  onSettingsPress: () => void;
  rightMetaSlot?: React.ReactNode;
}) {
  const { safeT } = useI18n();
  const handle = atUsername ? formatAtUsername(atUsername.replace(/^@/, "")) : null;

  return (
    <section className={`${MYINFO_SURFACE.profileCard} ${MYINFO_SURFACE.cardPad}`}>
      <div className="flex min-w-0 items-start gap-3">
        <SamarketUserAvatar avatarUrl={avatarUrl} sizePx={56} alt="" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className={`truncate ${MYINFO_TYPO.profileName}`}>{displayName}</p>
              {handle ? (
                <p className={`mt-0.5 truncate ${MYINFO_TYPO.handle}`}>{handle}</p>
              ) : (
                <p className={`mt-0.5 truncate ${MYINFO_TYPO.subText} text-[#6F4E37]`}>
                  {safeT("mypage_comp_set_dibay_id", {
                    fallbackKo: "아이디를 설정해 주세요",
                    fallbackEn: "Set your @ ID",
                  })}
                </p>
              )}
              {rightMetaSlot ? <div className="mt-2 flex justify-start">{rightMetaSlot}</div> : null}
            </div>
            <button
              type="button"
              onClick={onSettingsPress}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6F4E37] hover:bg-[#E8F3EE]"
              aria-label={safeT("mypage_settings_sheet_title", {
                fallbackKo: "설정",
                fallbackEn: "Settings",
              })}
            >
              <Settings className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {publicProfileHref ? (
            <Link
              href={publicProfileHref}
              className="mt-2 inline-flex max-w-full items-center gap-0.5 truncate text-[13px] font-semibold text-[#00704A] underline-offset-2 hover:underline"
            >
              <span className="truncate">
                {safeT("mypage_view_public_profile", {
                  fallbackKo: "공개 프로필 보기",
                  fallbackEn: "View public profile",
                })}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
