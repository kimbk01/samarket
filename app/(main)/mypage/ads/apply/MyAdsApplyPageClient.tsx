"use client";

import { resolveMyStickyCtaBodyClearanceClass } from "@/lib/mypage/my-sticky-cta-placement";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import {
  PointPromotionOrderForm,
  type PointPromotionOrderFormValues,
} from "@/components/points/PointPromotionOrderForm";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { usePromotionOrderTargets } from "@/hooks/usePromotionOrderTargets";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

const FORM_ID = "mypage-ads-apply-form";

/**
 * S46 신청 화면(포인트 홍보) — T3: 기존 폼 + 하단 고정 [신청](제출 방지), 잔액 "—" 처리, 오류 토스트.
 */
export function MyAdsApplyPageClient() {
  /** 하단탭 실제 마운트 기준 CTA 본문 여백 — 탭 있음/없음 safe 1회 (M-04) */
  const stickyCtaBodyClearanceClass = resolveMyStickyCtaBodyClearanceClass(useBottomNavOccupiesClearance());
  const { t } = useI18n();
  const router = useRouter();
  const { balance, loading: balanceLoading, error: balanceError } = useUserPointBalance();
  const { productOptions, loading: targetsLoading, unauthorized } =
    usePromotionOrderTargets();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const guard = useMypageSubmitGuard();
  const busy = guard.pending;

  const handleSubmit = (values: PointPromotionOrderFormValues) =>
    guard.run(async () => {
      setSubmitError(null);
      try {
        const res = await fetch("/api/me/points/promotion-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(values.idempotencyKey ? { "Idempotency-Key": values.idempotencyKey } : {}),
          },
          credentials: "include",
          body: JSON.stringify(values),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
        if (!res.ok || !j.ok) {
          const msg =
            j.code === "insufficient_balance" || j.error === "insufficient_balance"
              ? t("points_ui_insufficient")
              : j.error === "already_active_promotion"
                ? t("points_ui_promotion_conflict")
                : t("points_ui_request_failed");
          setSubmitError(msg);
          showMypageToast(msg, "error");
          return;
        }
        showMypageToast(t("mypage_oa_promotion_applied"), "success");
        invalidateMypageSummary();
        router.push("/mypage/points/promotions");
      } catch {
        setSubmitError(t("points_ui_request_failed"));
        showMypageToast(t("points_ui_request_failed"), "error");
      }
    });

  const submitForm = () => {
    const form = typeof document !== "undefined" ? (document.getElementById(FORM_ID) as HTMLFormElement | null) : null;
    form?.requestSubmit();
  };

  return (
    <div className="min-h-screen bg-sam-app">
      <MySubpageHeader
        title={t("mypage_ads_apply_title")}
        subtitle={t("mypage_ads_apply_subtitle")}
        backHref="/mypage/ads"
        preferHistoryBack
        hideCtaStrip
      />
      <div
        className={`${MYPAGE_BODY_COLUMN_CLASS} py-4 ${stickyCtaBodyClearanceClass}`}
      >
        {unauthorized ? (
          <p className="mb-4 rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft px-3 py-2 sam-text-body-secondary text-sam-fg">
            {t("auth_resource_access_denied")}
          </p>
        ) : null}
        {submitError ? (
          <p role="alert" className="mb-4 rounded-ui-rect bg-sam-danger-soft px-3 py-2 sam-text-body-secondary text-sam-danger">
            {submitError}
          </p>
        ) : null}
        {targetsLoading ? (
          <MyStateView kind="loading" template="form" rows={3} />
        ) : (
          <PointPromotionOrderForm
            formId={FORM_ID}
            hideSubmitButton
            onCanSubmitChange={setCanSubmit}
            balance={balanceError ? null : balance}
            balanceLoading={balanceLoading}
            productOptions={productOptions}
            onSubmit={(v) => void handleSubmit(v)}
            submitting={busy}
          />
        )}
      </div>
      {!targetsLoading ? (
        <MyStickyCta
          dirty={canSubmit}
          primary={{
            label: t("ads_apply_submit"),
            onPress: submitForm,
            loading: busy,
            disabled: busy,
          }}
        />
      ) : null}
    </div>
  );
}
