"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { resolveCustomerCenterBackHref } from "@/lib/mypage/customer-center-paths";

export default function MyPointsChargePage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <MyPointsChargePageInner />
    </Suspense>
  );
}

function MyPointsChargePageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const fromCs = searchParams.get("from") === "customer-center";
  const backHref = fromCs
    ? resolveCustomerCenterBackHref("customer-center")
    : "/mypage/points";
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_points_charge_title")}
        subtitle={t("mypage_points_charge_subtitle")}
        backHref={backHref}
        preferHistoryBack={false}
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
