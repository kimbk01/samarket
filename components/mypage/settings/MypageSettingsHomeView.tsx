"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import {
  MYPAGE_ADDRESSES_HREF,
  MYPAGE_REQUIRED_PHONE_HREF,
  MYPAGE_SETTINGS_HREF,
} from "@/lib/mypage/mypage-profile-routes";

function SettingsRow({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex h-[52px] min-w-0 items-center gap-2 border-b border-sam-border/80 px-4 last:border-b-0 active:bg-sam-app sm:px-5"
    >
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-sam-fg">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
    </Link>
  );
}

export function MypageSettingsHomeView() {
  const { safeT } = useI18n();

  return (
    <div className="flex flex-col gap-4 px-0 py-2">
      <section className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        <SettingsRow
          label={safeT("mypage_settings_account", {
            fallbackKo: "계정 관리",
            fallbackEn: "Account",
          })}
          href="/mypage/account"
        />
        <SettingsRow
          label={safeT("mypage_settings_notifications", {
            fallbackKo: "알림 설정",
            fallbackEn: "Notifications",
          })}
          href="/mypage/section/settings/notifications"
        />
        <SettingsRow
          label={safeT("mypage_settings_address", {
            fallbackKo: "주소 관리",
            fallbackEn: "Addresses",
          })}
          href={MYPAGE_ADDRESSES_HREF}
        />
        <SettingsRow
          label={safeT("mypage_settings_phone", {
            fallbackKo: "전화번호 인증",
            fallbackEn: "Phone verification",
          })}
          href={MYPAGE_REQUIRED_PHONE_HREF}
        />
      </section>

      <section className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
        <SettingsRow
          label={safeT("mypage_comp_section_support", {
            fallbackKo: "고객센터",
            fallbackEn: "Support",
          })}
          href="/mypage/section/settings/support"
        />
        <SettingsRow
          label={safeT("mypage_hub_terms_title", {
            fallbackKo: "약관 및 정책",
            fallbackEn: "Terms & policies",
          })}
          href="/terms"
        />
      </section>

      <div className="px-4 sm:px-5">
        <LogoutActionTrigger
          variant="danger_button"
          label={safeT("mypage_hub_logout", {
            fallbackKo: "로그아웃",
            fallbackEn: "Log out",
          })}
        />
      </div>
    </div>
  );
}
