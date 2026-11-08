"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  fetchMeStoreOrdersHubSummaryDeduped,
  invalidateMeStoreOrdersHubSummaryCache,
} from "@/lib/stores/store-delivery-api-client";
import type { BuyerStoreOrdersHubSummary } from "@/lib/delivery/customer/load-buyer-store-orders-hub-summary";
import { orderStatusName } from "@/lib/stores/store-order-process-model";

/**
 * 홈 「지금 진행 중」 — 진행 중인 배달 주문이 있을 때만 보인다(없으면 칸 자체 없음, 홈 설계안 v11 §2).
 * 데이터 = 기존 구매자 주문 요약(`/api/me/store-orders?hub_summary=1`). 상태 이름 = 주문 단일 정의 `orderStatusName`.
 */
export function HomeOngoingSection({ refreshSeq }: { refreshSeq: number }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const [summary, setSummary] = useState<BuyerStoreOrdersHubSummary | null>(null);

  useEffect(() => {
    let alive = true;
    if (refreshSeq > 0) invalidateMeStoreOrdersHubSummaryCache();
    void fetchMeStoreOrdersHubSummaryDeduped({ force: refreshSeq > 0 })
      .then((r) => {
        const s = (r.json as { hub_summary?: BuyerStoreOrdersHubSummary } | null)?.hub_summary ?? null;
        if (alive) setSummary(r.status === 200 ? s : null);
      })
      .catch(() => {
        if (alive) setSummary(null);
      });
    return () => {
      alive = false;
    };
  }, [refreshSeq]);

  if (!summary || summary.activeOrders <= 0 || !summary.recent) return null;
  const recent = summary.recent;
  return (
    <section className="mt-2 bg-white px-4 py-3.5" data-home-ongoing>
      <h2 className="mb-2.5 text-[16px] font-extrabold">{t("home_ongoing_title")}</h2>
      <button
        type="button"
        onClick={() => router.push("/orders")}
        className="flex w-full flex-col gap-0.5 rounded-ui-rect border border-sam-border p-3 text-left"
      >
        <span className="text-[11px] font-extrabold text-[#C0622A]">{t("home_ongoing_delivery")}</span>
        <b className="text-[14px]">{recent.store_name}</b>
        <span className="text-[12px] text-sam-muted">
          {orderStatusName(recent.order_status, "delivery", language)}
          {summary.activeOrders > 1 ? t("home_ongoing_more", { count: summary.activeOrders - 1 }) : ""}
        </span>
      </button>
    </section>
  );
}
