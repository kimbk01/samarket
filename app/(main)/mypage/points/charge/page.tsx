"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyPointsChargePage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_points_charge_title")}
        subtitle={t("mypage_points_charge_subtitle")}
        backHref="/mypage/points"
        section="account"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg p-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-center">
          <p className="sam-text-body leading-relaxed text-sam-muted">{t("mypage_points_charge_stub_notice")}</p>
        </div>
      </div>
    </div>
  );
}
