"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw, Siren } from "lucide-react";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import {
  formatOwnerDashUpdatedAt,
  ownerDashTypography,
  ownerDashUrgentCardClass,
} from "./owner-dashboard-ui";

type UrgentCell = {
  title: string;
  count: number;
  sub?: string;
  danger?: boolean;
  href: string;
};

export function OwnerUrgentOrdersCard({
  storeId,
  snapshot,
  pulseNew,
  updatedAt,
  onRefresh,
  refreshing,
}: {
  storeId: string;
  snapshot: OwnerStoreOpsSnapshot;
  pulseNew?: boolean;
  updatedAt: Date | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const ordersHref = buildStoreOrdersHref({ storeId, tab: "new" });
  const unconfirmed = Math.max(snapshot.pending_over_3m_count, 0);
  const cells: UrgentCell[] = [
    {
      title: "신규 주문",
      count: snapshot.pending_accept_count,
      sub:
        unconfirmed > 0
          ? `${unconfirmed}건이 3분 이상 대기중`
          : snapshot.pending_accept_count > 0
            ? "접수 대기 중"
            : undefined,
      danger: unconfirmed > 0 || snapshot.pending_accept_count > 0,
      href: ordersHref,
    },
    {
      title: "조리 지연",
      count: snapshot.cooking_delay_count,
      sub: snapshot.cooking_delay_count > 0 ? "예상시간 초과" : "정상",
      danger: snapshot.cooking_delay_count > 0,
      href: buildStoreOrdersHref({ storeId, tab: "preparing" }),
    },
    {
      title: "배달 지연",
      count: snapshot.delivery_delay_count,
      sub:
        snapshot.rider_unassigned_count > 0
          ? "라이더 미배정"
          : snapshot.delivery_delay_count > 0
            ? "배달 지연 발생"
            : "정상",
      danger: snapshot.delivery_delay_count > 0 || snapshot.rider_unassigned_count > 0,
      href: buildStoreOrdersHref({ storeId, tab: "shipping" }),
    },
    {
      title: "미확인 주문",
      count: unconfirmed,
      sub: unconfirmed > 0 ? "3분 이상 미확인" : "확인 완료",
      danger: unconfirmed > 0,
      href: ordersHref,
    },
  ];

  const hasUrgent =
    snapshot.pending_accept_count > 0 ||
    snapshot.cooking_delay_count > 0 ||
    snapshot.delivery_delay_count > 0 ||
    unconfirmed > 0;

  const timeLabel = updatedAt ? formatOwnerDashUpdatedAt(updatedAt) : "--:--:--";

  return (
    <section className={ownerDashUrgentCardClass("space-y-3")} aria-labelledby="owner-urgent-title">
      <div className="flex items-center justify-between gap-2 border-b border-[#FEE2E2] pb-2">
        <div className="flex items-center gap-1.5">
          <Siren className="h-4 w-4 text-[#DC2626]" aria-hidden />
          <h2 id="owner-urgent-title" className={ownerDashTypography.sectionTitle}>
            긴급 처리
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onRefresh?.()}
          disabled={refreshing}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
          aria-label="운영 데이터 새로고침"
        >
          <span>업데이트 {timeLabel}</span>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>

      {!hasUrgent ? (
        <p className={ownerDashTypography.helper}>지금 처리할 긴급 주문이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {cells.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              prefetch={false}
              className="min-h-[76px] rounded-[4px] border border-[#E5E7EB] bg-[#FAFAFA] p-2.5 transition active:bg-gray-100"
            >
              <p className={ownerDashTypography.cellTitle}>{c.title}</p>
              <p className={`mt-1 ${c.danger ? ownerDashTypography.metricUrgent : ownerDashTypography.metric}`}>
                {c.count}건
              </p>
              {c.sub ? (
                <p
                  className={`mt-1 flex items-start gap-0.5 ${ownerDashTypography.helper} ${
                    c.danger ? "font-medium text-[#DC2626]" : ""
                  }`}
                >
                  {c.danger ? <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> : null}
                  <span>{c.sub}</span>
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}

      <Link
        href={ordersHref}
        prefetch={false}
        className={`flex min-h-[44px] w-full items-center justify-center rounded-[4px] text-[14px] font-bold text-white ${
          hasUrgent ? "bg-[#DC2626] active:bg-red-700" : "pointer-events-none bg-gray-300 text-gray-600"
        } ${pulseNew && hasUrgent ? "animate-pulse" : ""}`}
        aria-disabled={!hasUrgent}
      >
        주문 확인하기
      </Link>
    </section>
  );
}
