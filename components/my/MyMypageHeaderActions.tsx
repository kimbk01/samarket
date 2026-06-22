"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Suspense } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyHeaderNotificationInbox } from "@/components/my/MyHeaderNotificationInbox";
import { MYPAGE_SETTINGS_HREF } from "@/lib/mypage/mypage-profile-routes";
import {
  samTier1HeaderIconCluster,
  SAM_TIER1_HEADER_ACTION_BTN_CLASS,
} from "@/lib/ui/tier1-header-icon";

function SettingsLink() {
  const { safeT } = useI18n();
  return (
    <Link
      href={MYPAGE_SETTINGS_HREF}
      className={SAM_TIER1_HEADER_ACTION_BTN_CLASS}
      aria-label={safeT("mypage_settings_sheet_title", {
        fallbackKo: "설정",
        fallbackEn: "Settings",
      })}
    >
      <Settings className="h-[22px] w-[22px]" aria-hidden />
    </Link>
  );
}

export function MyMypageHeaderActions() {
  return (
    <Suspense
      fallback={
        <div className={samTier1HeaderIconCluster}>
          <span className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} opacity-70`} aria-hidden />
          <span className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} opacity-70`} aria-hidden />
        </div>
      }
    >
      <div className={samTier1HeaderIconCluster}>
        <MyHeaderNotificationInbox />
        <SettingsLink />
      </div>
    </Suspense>
  );
}
