"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ServiceBrandIcon } from "@/components/brand/ServiceBrandIcon";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  fetchMeStoreOrdersHubSummaryDeduped,
  invalidateMeStoreOrdersHubSummaryCache,
} from "@/lib/stores/store-delivery-api-client";
import type { BuyerStoreOrdersHubSummary } from "@/lib/delivery/customer/load-buyer-store-orders-hub-summary";
import { orderStatusName } from "@/lib/stores/store-order-process-model";

/**
 * 진행 중 배달 한 줄 (회원만) — 진행 중인 배달 주문이 있을 때만 배너 아래 한 줄로 보인다(없으면 칸 없음, 시안 v22).
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
    <button
      type="button"
      onClick={() => router.push("/orders")}
      className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-ui-rect bg-white px-3.5 py-3 text-left shadow-[0_1px_3px_rgba(20,40,25,0.06)] active:opacity-80"
      data-home-ongoing
    >
      <ServiceBrandIcon brand="DIPICK" className="h-5 w-5 shrink-0 text-sam-primary" />
      <span className="min-w-0 flex-1 truncate text-[14px] text-[#141a16]">
        <b className="font-semibold">{recent.store_name}</b>
        <span className="text-[#767676]">
          {" "}
          {t("home_ongoing_line", { status: orderStatusName(recent.order_status, "delivery", language) })}
          {summary.activeOrders > 1 ? t("home_ongoing_more", { count: summary.activeOrders - 1 }) : ""}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#999]" aria-hidden />
    </button>
  );
}
