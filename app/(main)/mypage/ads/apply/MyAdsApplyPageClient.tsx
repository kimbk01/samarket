"use client";

import { MyScreen } from "@/components/mypage/ds/MyScreen";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
import { createPromotionAttemptKeyStore } from "@/lib/points/promotion-attempt-key";

const FORM_ID = "mypage-ads-apply-form";

/**
 * S46 신청 화면(포인트 홍보) — T3: 기존 폼 + 하단 고정 [신청](제출 방지), 잔액 "—" 처리, 오류 토스트.
 */
export function MyAdsApplyPageClient() {
  /** 하단탭 실제 마운트 기준 CTA 본문 여백 — 탭 있음/없음 safe 1회 (M-04) */
  const { t } = useI18n();
  const router = useRouter();
  const {
    balance,
    loading: balanceLoading,
    error: balanceError,
  } = useUserPointBalance();
  const {
    productOptions,
    loading: targetsLoading,
    unauthorized,
  } = usePromotionOrderTargets();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  /** 서버가 price_changed 를 돌려주면 폼이 새 가격을 다시 읽는다 */
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const guard = useMypageSubmitGuard();
  const busy = guard.pending;

  const attemptKeys = useRef(createPromotionAttemptKeyStore());
  const handleSubmit = (values: PointPromotionOrderFormValues) =>
    guard.run(async () => {
      setSubmitError(null);
      // 재감사 S-0 (X-1): 같은 글·같은 상품 결제 시도 = 같은 요청 키 (응답이 끊긴 뒤 다시 눌러도 한 번만 차감)
      const idem = attemptKeys.current.keyFor(values.targetId, values.productId);
      let status: number | null = null;
      try {
        const res = await fetch("/api/me/points/promotion-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idem },
          credentials: "include",
          body: JSON.stringify({ ...values, idempotencyKey: idem }),
        });
        status = res.status;
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          error?: string;
          /** 재감사 R2: 광고 중인 글에 다시 결제 → 같은 주문 연장 */
          extended?: boolean;
          idempotent?: boolean;
        };
        /** 성공 응답인데 본문을 못 읽음 = 결과를 모름 → 키 유지 */
        if (res.ok && typeof j.ok !== "boolean") status = null;
        if (!res.ok || !j.ok) {
          const msg =
            j.code === "insufficient_balance" ||
            j.error === "insufficient_balance"
              ? t("points_ui_insufficient")
              : j.error === "already_active_promotion"
              ? t("points_ui_promotion_conflict")
              : j.error === "price_changed"
              ? t("promo_price_changed")
              : t("points_ui_request_failed");
          if (j.error === "price_changed") setCatalogRefreshKey((k) => k + 1);
          setSubmitError(msg);
          showMypageToast(msg, "error");
          return;
        }
        showMypageToast(
          j.idempotent === true
            ? t("promo_purchase_already_done")
            : j.extended === true
              ? t("promo_sheet_extended_success")
              : t("mypage_oa_promotion_applied"),
          "success"
        );
        invalidateMypageSummary();
        router.push("/mypage/points/promotions");
      } catch {
        // 결과를 모름 → 키 유지 (다시 누르면 같은 결제로 확인)
        setSubmitError(t("promo_purchase_unconfirmed"));
        showMypageToast(t("promo_purchase_unconfirmed"), "error");
      } finally {
        attemptKeys.current.settleIfFinal(status);
      }
    });

  const submitForm = () => {
    const form =
      typeof document !== "undefined"
        ? (document.getElementById(FORM_ID) as HTMLFormElement | null)
        : null;
    form?.requestSubmit();
  };

  return (
    <MyScreen
      title={t("mypage_ads_apply_title")}
      backHref="/mypage/ads"
      template="form"
      stickyCta={
        !targetsLoading ? (
          <MyStickyCta
            dirty={canSubmit}
            primary={{
              label: t("ads_apply_submit"),
              onPress: submitForm,
              loading: busy,
              disabled: busy,
            }}
          />
        ) : undefined
      }
    >
      {unauthorized ? (
        <p className="mb-4 rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft px-3 py-2 sam-text-body-secondary text-sam-fg">
          {t("auth_resource_access_denied")}
        </p>
      ) : null}
      {submitError ? (
        <p
          role="alert"
          className="mb-4 rounded-ui-rect bg-sam-danger-soft px-3 py-2 sam-text-body-secondary text-sam-danger"
        >
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
          catalogRefreshKey={catalogRefreshKey}
        />
      )}
    </MyScreen>
  );
}
