"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
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
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { resolvePromotionsBackHref } from "@/lib/points/points-screen-tabs";
import { createPromotionAttemptKeyStore } from "@/lib/points/promotion-attempt-key";

const BONE = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";

/** 폼 3행 스켈레톤 */
function PromotionFormSkeleton() {
  return (
    <div
      aria-busy="true"
      className="space-y-4"
      data-testid="promotion-form-skeleton"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2" data-skeleton-row="">
          <span className={`block h-3 w-20 ${BONE}`} />
          <span className={`block h-[46px] w-full ${BONE}`} />
        </div>
      ))}
    </div>
  );
}

/** 목록 행 3 스켈레톤 */
function PromotionListSkeleton() {
  return (
    <ul
      aria-busy="true"
      className="space-y-3"
      data-testid="promotion-list-skeleton"
    >
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          data-skeleton-row=""
          className="space-y-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4"
        >
          <span className={`block h-4 w-[55%] ${BONE}`} />
          <span className={`block h-3 w-[40%] ${BONE}`} />
          <span className={`block h-5 w-16 rounded-full ${BONE}`} />
        </li>
      ))}
    </ul>
  );
}

function resolvePromotionSubmitError(
  t: (key: MessageKey) => string,
  payload: { code?: string; error?: string }
): string {
  if (
    payload.code === "insufficient_balance" ||
    payload.error === "insufficient_balance"
  ) {
    return t("points_ui_insufficient");
  }
  if (payload.error === "already_active_promotion") {
    return t("points_ui_promotion_conflict");
  }
  if (payload.error === "price_changed") {
    return t("promo_price_changed");
  }
  return t("points_ui_request_failed");
}

function MyPointsPromotionsPageInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTargetId =
    searchParams.get("postId")?.trim() ||
    searchParams.get("targetId")?.trim() ||
    null;
  const {
    balance,
    loading: balanceLoading,
    error: balanceError,
    refresh: refreshBalance,
  } = useUserPointBalance();
  const shownBalance = balanceLoading || balanceError ? null : balance;
  const {
    productOptions,
    loading: targetsLoading,
    unauthorized,
  } = usePromotionOrderTargets();
  const [orders, setOrders] = useState<PointPromotionOrder[]>([]);
  /** 서버가 price_changed 를 돌려주면 폼이 새 가격을 다시 읽는다 */
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  /** 목록 조회 실패 — 빈 목록으로 표시하지 않는다(오류+재시도, 폼은 계속 사용 가능) */
  const [ordersError, setOrdersError] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const submitGuard = useMypageSubmitGuard();
  const busy = submitGuard.pending;

  const loadOrders = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      // 본문은 single-flight 안에서 1회만 파싱
      const { ok, j } = await runSingleFlight(
        "me:promotion-orders:get",
        async () => {
          const res = await fetch("/api/me/points/promotion-orders", {
            cache: "no-store",
            credentials: "include",
          });
          const body = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            orders?: PointPromotionOrder[];
          };
          return { ok: res.ok, j: body };
        }
      );
      if (ok && j.ok && Array.isArray(j.orders)) {
        setOrders(j.orders);
        setOrdersError(false);
      } else if (!opts?.silent) {
        setOrdersError(true);
      }
    } catch {
      if (!opts?.silent) setOrdersError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const attemptKeys = useRef(createPromotionAttemptKeyStore());
  const handleSubmit = (values: PointPromotionOrderFormValues) =>
    submitGuard.run(async () => {
      setSubmitErr("");
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
          const msg = resolvePromotionSubmitError(t, j);
          if (j.error === "price_changed") setCatalogRefreshKey((k) => k + 1);
          setSubmitErr(msg);
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
        await Promise.all([loadOrders({ silent: true }), refreshBalance()]);
        router.refresh();
      } catch {
        // 결과를 모름 → 키 유지 · 주문·잔액을 다시 불러와 상태를 보여 준다
        await Promise.all([loadOrders({ silent: true }), refreshBalance()]).catch(() => undefined);
        setSubmitErr(t("promo_purchase_unconfirmed"));
        showMypageToast(t("promo_purchase_unconfirmed"), "error");
      } finally {
        attemptKeys.current.settleIfFinal(status);
      }
    });

  return (
    <MyScreen
      title={t("mypage_points_promotions_title")}
      backHref={resolvePromotionsBackHref(initialTargetId)}
      template="form"
    >
      <div className="space-y-6">
        <div className="rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-fg">
          {t("mypage_points_promotions_notice")}
        </div>
        {unauthorized ? (
          <p className="rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft px-3 py-2 sam-text-body-secondary text-sam-fg">
            {t("auth_resource_access_denied")}
          </p>
        ) : null}
        <PointBalanceCard balance={shownBalance} />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="mb-3 sam-text-body font-semibold text-sam-fg">
            {t("points_ui_new_promotion_order")}
          </h2>
          {submitErr ? (
            <p className="mb-3 sam-text-body text-sam-danger" role="alert">
              {submitErr}
            </p>
          ) : null}
          {targetsLoading ? (
            <PromotionFormSkeleton />
          ) : (
            <PointPromotionOrderForm
              balance={shownBalance}
              balanceLoading={balanceLoading}
              productOptions={productOptions}
              initialTargetId={initialTargetId}
              onSubmit={(v) => void handleSubmit(v)}
              submitLabel={busy ? t("common_loading") : undefined}
              submitting={busy}
              catalogRefreshKey={catalogRefreshKey}
            />
          )}
        </div>
        <div>
          <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">
            {t("points_ui_my_promotion_orders")}
          </h2>
          {loading ? (
            <PromotionListSkeleton />
          ) : ordersError ? (
            <MyStateView
              kind="error"
              error={{
                message: t("mypage_oa_promotions_load_failed"),
                onRetry: () => void loadOrders(),
              }}
            />
          ) : (
            <PointPromotionOrderList orders={orders} />
          )}
        </div>
      </div>
    </MyScreen>
  );
}

export default function MyPointsPromotionsPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-sam-app" aria-busy="true" />}>
      <MyPointsPromotionsPageInner />
    </Suspense>
  );
}
