"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MY_STICKY_CTA_BODY_CLEARANCE_CLASS } from "@/components/mypage/ds/MyStickyCta";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { PointChargeForm } from "@/components/points/PointChargeForm";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { buildMemberSupportContext } from "@/lib/support/support-context";
import { resolveCustomerCenterBackHref } from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { PointPlan } from "@/lib/types/point";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

/** S41 스켈레톤 — 플랜 카드 3 + 안내 박스 */
function PointChargeSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" data-testid="point-charge-skeleton" className={`${MYPAGE_BODY_COLUMN_CLASS} space-y-2 pt-2`}>
      <span className={`mb-2 block h-4 w-24 ${bone}`} />
      <div className="grid gap-2 md:grid-cols-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-skeleton-row=""
            className="flex min-h-[64px] items-center justify-between gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3"
          >
            <span className={`h-4 w-[45%] ${bone}`} />
            <span className={`h-4 w-16 ${bone}`} />
          </div>
        ))}
      </div>
      <span className={`mt-4 block h-20 w-full ${bone}`} />
    </div>
  );
}

/**
 * Suspense 대체 화면 = 본문 로딩과 **같은 셸·같은 위치**의 스켈레톤(헤더는 1단이 경로 표 제목으로 즉시 그림).
 * 셸 밖에 스켈레톤만 그리면 거터가 달라 본문 로딩으로 넘어갈 때 위치가 튄다.
 */
function PointChargeRouteFallback() {
  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <PointChargeSkeleton />
      </div>
    </div>
  );
}

export default function MyPointsChargePage() {
  return (
    <Suspense fallback={<PointChargeRouteFallback />}>
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
      // Parse inside the flight so concurrent joiners share JSON, not a one-shot Response body.
      const j = await runSingleFlight("me:point-plans:get", async () => {
        const res = await fetch("/api/me/point-plans", {
          credentials: "include",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          plans?: PointPlan[];
          error?: string;
        };
        return { ok: res.ok, ...body };
      });
      if (!j.ok) {
        // 오류 코드 노출 금지 — 공통 문구 + 재시도
        setLoadError(t("mypage_oa_charge_plans_load_failed"));
        setPlans([]);
        return;
      }
      // 플랜 0 = 빈 안내(오류 아님) — PointChargeForm 이 "지금은 충전할 수 있는 상품이 없어요" 표시
      setPlans(Array.isArray(j.plans) ? j.plans : []);
    } catch {
      setLoadError(t("mypage_oa_charge_plans_load_failed"));
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  return (
    <SupportContextProvider
      value={buildMemberSupportContext({
        enabled: true,
        category: "PAYMENT_RECHARGE",
        sourceSurface: "mypage_points_charge",
      })}
    >
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <MySubpageHeader
        title={t("mypage_points_charge_title")}
        subtitle={t("mypage_points_charge_subtitle")}
        backHref={backHref}
        preferHistoryBack={false}
        section="account"
        hideCtaStrip
      />
      <div className={`${CUSTOMER_CENTER_SCROLL_BODY_CLASS} ${!loading && !loadError && plans.length > 0 ? MY_STICKY_CTA_BODY_CLEARANCE_CLASS : ""}`}>
        {loading ? (
          <PointChargeSkeleton />
        ) : loadError ? (
          <MyStateView kind="error" error={{ message: loadError, onRetry: () => void loadPlans() }} />
        ) : (
          <PointChargeForm
            layout="page"
            plans={plans}
            onSuccess={() => {
              showMypageToast(t("mypage_oa_charge_request_done"), "success");
              invalidateMypageSummary();
              router.replace(fromCs ? "/mypage/points?from=customer-center" : "/mypage/points");
            }}
          />
        )}
      </div>
    </div>
    </SupportContextProvider>
  );
}
