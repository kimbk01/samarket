"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import {
  PointPromotionOrderForm,
  type PointPromotionOrderFormValues,
} from "@/components/points/PointPromotionOrderForm";
import { usePromotionOrderTargets } from "@/hooks/usePromotionOrderTargets";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";

export function MyAdsApplyPageClient() {
  const { t } = useI18n();
  const router = useRouter();
  const { balance, loading: balanceLoading } = useUserPointBalance();
  const { productOptions, shopOptions, loading: targetsLoading, unauthorized } =
    usePromotionOrderTargets();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (values: PointPromotionOrderFormValues) => {
    if (busy) return;
    setSubmitError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/me/points/promotion-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });
      const j = (await res.json()) as { ok?: boolean; code?: string; error?: string };
      if (!res.ok || !j.ok) {
        if (j.code === "insufficient_balance" || j.error === "insufficient_balance") {
          setSubmitError(t("points_ui_insufficient"));
        } else if (j.error === "already_active_promotion") {
          setSubmitError(t("points_ui_promotion_conflict"));
        } else {
          setSubmitError(t("points_ui_request_failed"));
        }
        return;
      }
      router.push("/my/points/promotions");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_ads_apply_title")}
        subtitle={t("mypage_ads_apply_subtitle")}
        backHref="/my/ads"
        section="store"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg px-4 py-4">
        {unauthorized ? (
          <p className="mb-4 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-900">
            {t("auth_resource_access_denied")}
          </p>
        ) : null}
        {submitError && (
          <p className="mb-4 rounded-ui-rect bg-red-50 px-3 py-2 sam-text-body-secondary text-red-700">
            {submitError}
          </p>
        )}
        {targetsLoading ? (
          <p className="py-10 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : (
          <PointPromotionOrderForm
            balance={balance}
            balanceLoading={balanceLoading}
            productOptions={productOptions}
            shopOptions={shopOptions}
            onSubmit={(v) => void handleSubmit(v)}
            submitLabel={busy ? t("common_loading") : t("ads_apply_submit")}
          />
        )}
      </div>
    </div>
  );
}
