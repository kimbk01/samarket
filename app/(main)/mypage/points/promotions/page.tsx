"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointPromotionOrderList } from "@/components/points/PointPromotionOrderList";
import {
  PointPromotionOrderForm,
  type PointPromotionOrderFormValues,
} from "@/components/points/PointPromotionOrderForm";
import { usePromotionOrderTargets } from "@/hooks/usePromotionOrderTargets";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PointPromotionOrder } from "@/lib/types/point";

function resolvePromotionSubmitError(
  t: (key: MessageKey) => string,
  payload: { code?: string; error?: string }
): string {
  if (payload.code === "insufficient_balance" || payload.error === "insufficient_balance") {
    return t("points_ui_insufficient");
  }
  if (payload.error === "already_active_promotion") {
    return t("points_ui_promotion_conflict");
  }
  return t("points_ui_request_failed");
}

export default function MyPointsPromotionsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { balance, loading: balanceLoading, refresh: refreshBalance } = useUserPointBalance();
  const {
    productOptions,
    loading: targetsLoading,
    unauthorized,
  } = usePromotionOrderTargets();
  const [orders, setOrders] = useState<PointPromotionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitErr, setSubmitErr] = useState("");
  const [busy, setBusy] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await runSingleFlight("me:promotion-orders:get", () =>
        fetch("/api/me/points/promotion-orders", { cache: "no-store", credentials: "include" })
      );
      const j = (await res.json()) as { ok?: boolean; orders?: PointPromotionOrder[] };
      if (j.ok && Array.isArray(j.orders)) {
        setOrders(j.orders);
      } else {
        setOrders([]);
      }
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const handleSubmit = async (values: PointPromotionOrderFormValues) => {
    if (busy) return;
    setBusy(true);
    setSubmitErr("");
    try {
      const res = await fetch("/api/me/points/promotion-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(values.idempotencyKey
            ? { "Idempotency-Key": values.idempotencyKey }
            : {}),
        },
        credentials: "include",
        body: JSON.stringify(values),
      });
      const j = (await res.json()) as { ok?: boolean; code?: string; error?: string };
      if (!res.ok || !j.ok) {
        setSubmitErr(resolvePromotionSubmitError(t, j));
        return;
      }
      await Promise.all([loadOrders(), refreshBalance()]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_points_promotions_title")}
        subtitle={t("mypage_points_promotions_subtitle")}
        backHref="/mypage/points"
        section="account"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg space-y-6 p-4">
        <div className="rounded-ui-rect border border-amber-100 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-900">
          {t("mypage_points_promotions_notice")}
        </div>
        {unauthorized ? (
          <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-900">
            {t("auth_resource_access_denied")}
          </p>
        ) : null}
        <PointBalanceCard balance={balance} />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="mb-3 sam-text-body font-semibold text-sam-fg">
            {t("points_ui_new_promotion_order")}
          </h2>
          {submitErr ? (
            <p className="mb-3 sam-text-body text-red-600" role="alert">
              {submitErr}
            </p>
          ) : null}
          {targetsLoading ? (
            <p className="py-6 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
          ) : (
            <PointPromotionOrderForm
              balance={balance}
              balanceLoading={balanceLoading}
              productOptions={productOptions}
              onSubmit={(v) => void handleSubmit(v)}
              submitLabel={busy ? t("common_loading") : undefined}
            />
          )}
        </div>
        <div>
          <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">
            {t("points_ui_my_promotion_orders")}
          </h2>
          {loading ? (
            <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
          ) : (
            <PointPromotionOrderList orders={orders} />
          )}
        </div>
      </div>
    </div>
  );
}
