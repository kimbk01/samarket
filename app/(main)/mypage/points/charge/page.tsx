"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { PointChargeForm } from "@/components/points/PointChargeForm";
import { resolveCustomerCenterBackHref } from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { PointPlan } from "@/lib/types/point";

export default function MyPointsChargePage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <MyPointsChargePageInner />
    </Suspense>
  );
}

function MyPointsChargePageInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const fromCs = from === "customer-center";
  const backHref = fromCs
    ? resolveCustomerCenterBackHref("customer-center")
    : "/mypage/points";
  const [plans, setPlans] = useState<PointPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await runSingleFlight("me:point-plans:get", () =>
        fetch("/api/me/point-plans", { credentials: "include", cache: "no-store" }),
      );
      const j = (await res.json().catch(() => ({}))) as { plans?: PointPlan[]; error?: string };
      if (!res.ok) {
        setLoadError(j.error ?? t("points_ui_request_failed"));
        setPlans([]);
        return;
      }
      setPlans(Array.isArray(j.plans) ? j.plans : []);
    } catch {
      setLoadError(t("points_ui_request_failed"));
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <MySubpageHeader
        title={t("mypage_points_charge_title")}
        subtitle={t("mypage_points_charge_subtitle")}
        backHref={backHref}
        preferHistoryBack={false}
        section="account"
        hideCtaStrip
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        {loading ? (
          <p className="px-4 py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : loadError ? (
          <div className="space-y-3 px-4 py-6">
            <p className="text-center sam-text-body text-red-600">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadPlans()}
              className="mx-auto block min-h-11 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium"
            >
              {t("common_retry")}
            </button>
          </div>
        ) : (
          <PointChargeForm
            layout="page"
            plans={plans}
            onSuccess={() => {
              router.replace(fromCs ? "/mypage/points?from=customer-center" : "/mypage/points");
            }}
          />
        )}
      </div>
    </div>
  );
}
