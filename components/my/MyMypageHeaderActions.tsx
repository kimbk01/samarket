"use client";

import { Suspense } from "react";
import Link from "next/link";
import { MyHeaderNotificationInbox } from "@/components/my/MyHeaderNotificationInbox";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageIaCategoryHref } from "@/lib/mypage/mypage-ia";
import { Tier1HeaderSettingsGlyph } from "@/lib/ui/tier1-header-glyphs";
import {
  samTier1HeaderIconCluster,
  SAM_TIER1_HEADER_ACTION_BTN_CLASS,
} from "@/lib/ui/tier1-header-icon";

/**
 * 내정보 홈 헤더 오른쪽 — [⚙ 앱 설정] [🔔 알림] (Owner 2026-11-03).
 * 종은 다른 탭과 같은 오른쪽 끝 자리, 앱 설정은 종 왼쪽. 고객센터는 홈 분류 카드 「고객지원」에 남는다.
 */
export function MyMypageHeaderActions() {
  const { t } = useI18n();
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
        <Link
          href={buildMypageIaCategoryHref("settings")}
          className={SAM_TIER1_HEADER_ACTION_BTN_CLASS}
          aria-label={t("mypage_ia_cat_settings")}
          data-testid="mypage-header-app-settings"
        >
          <Tier1HeaderSettingsGlyph />
        </Link>
        <MyHeaderNotificationInbox />
      </div>
    </Suspense>
  );
}
