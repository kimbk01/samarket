"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { isLikelyUuid } from "@/lib/stores/is-likely-uuid";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { fetchMeStoreOrderDetailDeduped } from "@/lib/stores/store-delivery-api-client";

type RealOrderHead = {
  id: string;
  order_no: string;
  store_name: string;
  store_slug: string;
  payment_amount: number;
  order_status: string;
  fulfillment_type: string;
};

export function RestaurantOrderCompleteClient({ storeSlug }: { storeSlug: string }) {
  const { t } = useI18n();
  const sp = useSearchParams();
  const orderId = sp.get("orderId")?.trim() ?? "";

  const [real, setReal] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | {
        kind: "ok";
        order: RealOrderHead;
        canSubmitReview: boolean;
        hasReview: boolean;
      }
    | { kind: "fail" }
  >({ kind: "idle" });

  const loadReal = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!orderId || !isLikelyUuid(orderId)) {
        setReal({ kind: "idle" });
        return;
      }
      const silent = !!opts?.silent;
      if (!silent) setReal({ kind: "loading" });
      try {
        const { json } = await fetchMeStoreOrderDetailDeduped(orderId);
        const j = json as {
          ok?: boolean;
          order?: RealOrderHead;
          can_submit_review?: boolean;
          review?: { id?: string };
        };
        if (!j?.ok || !j.order) {
          if (!silent) setReal({ kind: "fail" });
          return;
        }
        const o = j.order as RealOrderHead;
        if (o.store_slug && o.store_slug !== storeSlug) {
          if (!silent) setReal({ kind: "fail" });
          return;
        }
        setReal({
          kind: "ok",
          order: o,
          canSubmitReview: !!j.can_submit_review,
          hasReview: !!j.review?.id,
        });
      } catch {
        if (!silent) setReal({ kind: "fail" });
      }
    },
    [orderId, storeSlug]
  );

  useEffect(() => {
    void loadReal();
  }, [loadReal]);

  useRefetchOnPageShowRestore(() => void loadReal({ silent: true }));

  if (orderId && isLikelyUuid(orderId)) {
    if (real.kind === "loading" || real.kind === "idle") {
      return <p className="p-6 text-center text-sm text-sam-muted">{t("common_loading")}</p>;
    }
    if (real.kind === "ok") {
      const o = real.order;
      const { canSubmitReview, hasReview } = real;
      const showReviewCta =
        o.order_status === "completed" && canSubmitReview && !hasReview;
      return (
        <div className="min-h-screen bg-sam-app px-4 py-8 pb-16">
          <div className="mx-auto max-w-md rounded-ui-rect border border-emerald-100 bg-sam-surface p-6 shadow-sm">
            <p className="text-center text-sm font-semibold text-emerald-700">
              {o.order_status === "completed" ? t("store_order_completed") : t("store_order_accepted")}
            </p>
            <h1 className="mt-2 text-center text-xl font-bold text-sam-fg">{t("store_order_thanks")}</h1>
            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-sam-muted">{t("store_order_number")}</dt>
                <dd className="font-mono font-semibold">{o.order_no}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sam-muted">{t("store_order_vendor")}</dt>
                <dd className="font-medium">{o.store_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sam-muted">{t("store_order_amount")}</dt>
                <dd className="font-bold">{formatMoneyPhp(o.payment_amount)}</dd>
              </div>
            </dl>
            {showReviewCta ? (
              <Link
                href={`/my/store-orders/${encodeURIComponent(o.id)}/review`}
                className="mt-6 block w-full rounded-ui-rect bg-amber-500 py-3 text-center text-sm font-bold text-white shadow-sm"
              >
                {t("tier1_review_write")}
              </Link>
            ) : null}
            {!showReviewCta && o.order_status !== "completed" ? (
              <p className="mt-4 rounded-ui-rect bg-sam-app px-3 py-2 text-center sam-text-xxs leading-relaxed text-sam-muted">
                {t("nav_chat_order_follow_notice")}
              </p>
            ) : null}
            <Link
              href={`/my/store-orders/${encodeURIComponent(o.id)}`}
              className={`${showReviewCta ? "mt-3" : "mt-6"} block w-full rounded-ui-rect bg-signature py-3 text-center text-sm font-bold text-white`}
            >
              {t("store_order_view_detail_btn")}
            </Link>
            <Link
              href="/mypage/store-orders"
              className="delivery-ui mt-2 block w-full rounded-[var(--delivery-radius)] border border-[color:var(--delivery-primary)] bg-[color:var(--delivery-primary-soft)] py-3 text-center text-sm font-bold text-[color:var(--delivery-primary)]"
            >
              {t("store_order_history_drawer_title")}
            </Link>
            <Link
              href={`/my/store-orders/${encodeURIComponent(o.id)}/chat`}
              className="mt-3 block w-full rounded-ui-rect border border-signature bg-signature/5 py-3 text-center text-sm font-semibold text-signature"
            >
              {t("store_leave_store_inquiry")}
            </Link>
            <Link
              href={`/stores/${encodeURIComponent(storeSlug)}/order/${encodeURIComponent(o.id)}`}
              className="mt-2 block w-full py-2 text-center text-sm text-sam-muted underline"
            >
              {t("common_view_store")}
            </Link>
            <Link
              href={`/stores/${encodeURIComponent(storeSlug)}`}
              className="mt-2 block w-full py-2 text-center text-sm text-sam-muted"
            >
              {t("common_back_to_store")}
            </Link>
          </div>
        </div>
      );
    }
  }

  const maybeReal = orderId.length > 0 && isLikelyUuid(orderId);
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm text-sam-muted">{t("store_order_load_failed")}</p>
      {maybeReal ? (
        <p className="mt-2 text-sm text-sam-muted">
          {t("store_order_history_panel_open_aria")}
        </p>
      ) : null}
      {maybeReal ? (
        <Link
          href={`/my/store-orders/${encodeURIComponent(orderId)}`}
          className="mt-4 inline-block text-sm font-medium text-signature underline"
        >
          {t("store_order_view_detail_btn")}
        </Link>
      ) : null}
      <Link href="/stores" className="mt-4 block text-sm text-signature">
        {t("common_store")}
      </Link>
    </div>
  );
}
