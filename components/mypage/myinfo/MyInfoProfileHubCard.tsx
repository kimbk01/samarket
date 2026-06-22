"use client";

import Link from "next/link";
import { ChevronRight, LogOut, Settings } from "lucide-react";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAtUsername } from "@/lib/users/user-label";
import { MYINFO_SURFACE, MYINFO_TYPO } from "./myinfo-theme";
import type { MyInfoStatItem } from "./MyInfoStatGrid";
import {
  MYPAGE_HOME_STAT_LABEL_CLASS,
  MYPAGE_HOME_STAT_VALUE_ACCENT_CLASS,
  MYPAGE_HOME_STAT_VALUE_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

export function MyInfoProfileHubCard({
  avatarUrl,
  displayName,
  atUsername,
  publicProfileHref,
  mannerSlot,
  statItems,
  onSettingsPress,
  onLogoutPress,
}: {
  avatarUrl: string | null;
  displayName: string;
  atUsername?: string | null;
  publicProfileHref?: string | null;
  mannerSlot?: React.ReactNode;
  statItems: MyInfoStatItem[];
  onSettingsPress: () => void;
  onLogoutPress: () => void;
}) {
  const { safeT, t } = useI18n();
  const handle = atUsername ? formatAtUsername(atUsername.replace(/^@/, "")) : null;

  return (
    <section className={MYINFO_SURFACE.profileCard}>
      <div className={`${MYINFO_SURFACE.cardPad} space-y-4`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6F4E37]">
            {safeT("mypage_hub_profile_title", {
              fallbackKo: "내 프로필",
              fallbackEn: "My profile",
            })}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onLogoutPress}
              className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-[#6F4E37] hover:bg-[#F7FAF8]"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span>{t("mypage_comp_settings_block_logout")}</span>
            </button>
            <button
              type="button"
              onClick={onSettingsPress}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#6F4E37] hover:bg-[#E8F3EE]"
              aria-label={safeT("mypage_settings_sheet_title", {
                fallbackKo: "설정",
                fallbackEn: "Settings",
              })}
            >
              <Settings className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-3.5">
          <SamarketUserAvatar avatarUrl={avatarUrl} sizePx={72} alt="" />
          <div className="min-w-0 flex-1 pt-0.5">
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
            {mannerSlot ? <div className="mt-2">{mannerSlot}</div> : null}
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

        {statItems.length > 0 ? (
          <div className="grid grid-cols-5 divide-x divide-[#D4E9E2]/80 border-t border-[#D4E9E2]/80 pt-3">
            {statItems.map((it) => (
              <Link
                key={`${it.label}:${it.href}`}
                href={it.href}
                className="flex min-w-0 flex-col items-center gap-0.5 px-1 py-1 text-center active:opacity-80"
              >
                <span className={`${MYPAGE_HOME_STAT_LABEL_CLASS} text-[10px]`}>{it.label}</span>
                <span
                  className={`truncate text-[15px] font-bold tabular-nums ${
                    it.accent ? MYPAGE_HOME_STAT_VALUE_ACCENT_CLASS : MYPAGE_HOME_STAT_VALUE_CLASS
                  }`}
                >
                  {it.value}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
