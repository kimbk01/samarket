"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_PROFILE_EDIT_SHEET_HREF } from "@/lib/mypage/mypage-profile-routes";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

export function ProfileActionButtons() {
  const { t } = useI18n();
  return (
    <div className="mt-3 flex gap-2">
      <Link
        href={MYPAGE_PROFILE_EDIT_SHEET_HREF}
        className="flex-1 rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 text-center sam-text-body font-medium text-sam-fg"
      >
        {t("my_profile_edit_btn")}
      </Link>
      <Link
        href={buildMypageInfoHubHref()}
        className="flex-1 rounded-ui-rect border border-signature bg-signature/10 py-2.5 text-center sam-text-body font-medium text-signature"
      >
        {t("my_app_service_settings_btn")}
      </Link>
    </div>
  );
}
