"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSupabaseStoreOrdersRealtime } from "@/hooks/useSupabaseStoreOrdersRealtime";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { fetchStoreOrdersListDeduped } from "@/lib/stores/fetch-store-orders-list-deduped";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { BusinessProduct, BusinessProfile } from "@/lib/types/business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { BusinessOwnerOpsStrip } from "@/components/business/BusinessOwnerOpsStrip";
import { BusinessDashboardKpiStrip, type DashboardKpi } from "@/components/business/admin/dashboard/BusinessDashboardKpiStrip";
import { BusinessDashboardPriorityCards } from "@/components/business/admin/dashboard/BusinessDashboardPriorityCards";
import { BusinessDashboardOrderTimeline, type TimelineOrder } from "@/components/business/admin/dashboard/BusinessDashboardOrderTimeline";
import { BusinessDashboardQuickRow } from "@/components/business/admin/dashboard/BusinessDashboardQuickRow";
import { BusinessDashboardInsights } from "@/components/business/admin/dashboard/BusinessDashboardInsights";
import { BusinessDashboardMobileBar } from "@/components/business/admin/dashboard/BusinessDashboardMobileBar";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

type InquiryRow = { id: string; status: string };

type SettlementRow = {
  store_id: string;
  settlement_status: string;
  settlement_amount: number;
};

function isTerminalOrderStatus(s: string): boolean {
  return s === "completed" || s === "cancelled" || s === "refunded";
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfDayMs(daysAgo: number): number {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function BusinessAdminDashboard({
  row,
  profile,
  products,
  canSell,
  orderAlertsBadge,
  loadRemote,
}: {
  row: StoreRow;
  profile: BusinessProfile;
  products: BusinessProduct[];
  canSell: boolean;
  orderAlertsBadge: number;
  loadRemote: () => Promise<void>;
}) {
  const q = `storeId=${encodeURIComponent(row.id)}`;
  const ordersBaseHref = buildStoreOrdersHref({ storeId: row.id });
  const inquiriesHref = `/my/business/inquiries?${q}`;
  const productsHubHref = `/my/business/products?${q}`;
  const settlementsHref = "/my/business/settlements";

  const [orders, setOrders] = useState<TimelineOrder[]>([]);
  const [meta, setMeta] = useState({
    pending_accept: 0,
    refund_requested: 0,
    pending_delivery: 0,
  });
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [dashLoading, setDashLoading] = useState(true);

  const alertStoreIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    alertStoreIdRef.current = row.id;
  }, [row.id]);

  useEffect(() => {
    const fn = () => primeStoreOrderAlertAudio();
    document.addEventListener("pointerdown", fn, { once: true });
    return () => document.removeEventListener("pointerdown", fn);
  }, []);

  const onStoreOrderInsert = useCallback((r: Record<string, unknown>) => {
    if (String(r.fulfillment_type ?? "") !== "local_delivery") return;
    playDeliveryOrderAlertDebounced(alertStoreIdRef.current);
  }, []);

  useSupabaseStoreOrdersRealtime(row.id, onStoreOrderInsert);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const [oj, ir, sr] = await Promise.all([
        fetchStoreOrdersListDeduped(row.id),
        fetch(`/api/me/stores/${encodeURIComponent(row.id)}/inquiries`, { credentials: "include" }),
        fetch("/api/me/store-settlements", { credentials: "include" }),
      ]);
      const ordersJson = oj.json as {
        ok?: boolean;
        orders?: TimelineOrder[];
        meta?: {
          pending_accept_count?: unknown;
          refund_requested_count?: unknown;
          pending_delivery_count?: unknown;
        };
      };
      if (ordersJson?.ok && Array.isArray(ordersJson.orders)) {
        setOrders(ordersJson.orders);
        setMeta({
          pending_accept: Math.max(0, Math.floor(Number(ordersJson.meta?.pending_accept_count) || 0)),
          refund_requested: Math.max(0, Math.floor(Number(ordersJson.meta?.refund_requested_count) || 0)),
          pending_delivery: Math.max(0, Math.floor(Number(ordersJson.meta?.pending_delivery_count) || 0)),
        });
      } else {
        setOrders([]);
        setMeta({ pending_accept: 0, refund_requested: 0, pending_delivery: 0 });
      }

      const ij = await ir.json().catch(() => ({}));
      setInquiries(ij?.ok && Array.isArray(ij.inquiries) ? (ij.inquiries as InquiryRow[]) : []);

      const sj = await sr.json().catch(() => ({}));
      const allSettlements: SettlementRow[] =
        sj?.ok && Array.isArray(sj.settlements) ? (sj.settlements as SettlementRow[]) : [];
      setSettlements(allSettlements.filter((s) => s.store_id === row.id));
    } catch {
      setOrders([]);
      setInquiries([]);
      setSettlements([]);
    } finally {
      setDashLoading(false);
    }
  }, [row.id]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void loadDashboard();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [loadDashboard]);

  const openInquiryCount = useMemo(
    () => inquiries.filter((r) => r.status === "open").length,
    [inquiries]
  );

  const soldOutProducts = useMemo(
    () => products.filter((p) => p.status === "sold_out").length,
    [products]
  );

  const kpi: DashboardKpi = useMemo(() => {
    const t0 = startOfTodayMs();
    const t7 = startOfDayMs(7);
    let todaySales = 0;
    let weekSales = 0;
    let inProgress = 0;
    let cancelWeek = 0;
    let denomWeek = 0;

    for (const o of orders) {
      const ts = new Date(o.created_at).getTime();
      const pay = Math.round(Number(o.payment_amount) || 0);
      if (o.order_status === "completed") {
        if (ts >= t0) todaySales += pay;
        if (ts >= t7) weekSales += pay;
      }
      if (ts >= t7) {
        denomWeek += 1;
        if (o.order_status === "cancelled") cancelWeek += 1;
      }
      if (!isTerminalOrderStatus(o.order_status) && o.order_status !== "pending") {
        inProgress += 1;
      }
    }

    let settlementPending = 0;
    let settlementPaid = 0;
    let settlementHeld = 0;
    for (const s of settlements) {
      const amt = Math.round(Number(s.settlement_amount) || 0);
      if (s.settlement_status === "scheduled" || s.settlement_status === "processing") {
        settlementPending += amt;
      } else if (s.settlement_status === "paid") {
        settlementPaid += amt;
      } else if (s.settlement_status === "held") {
        settlementHeld += amt;
      }
    }

    const cancelRatePercent = denomWeek > 0 ? Math.round((cancelWeek / denomWeek) * 100) : 0;

    return {
      newOrders: meta.pending_accept,
      inProgress,
      openInquiries: openInquiryCount,
      todaySalesPhp: todaySales,
      settlementPendingPhp: settlementPending,
      soldOutProducts,
    };
  }, [orders, meta.pending_accept, openInquiryCount, soldOutProducts, settlements]);

  const timelineOrders = useMemo(() => orders.slice(0, 8), [orders]);

  const insights = useMemo(() => {
    const t0 = startOfTodayMs();
    const t7 = startOfDayMs(7);
    let todaySales = 0;
    let weekSales = 0;
    let cancelWeek = 0;
    let denomWeek = 0;
    for (const o of orders) {
      const ts = new Date(o.created_at).getTime();
      const pay = Math.round(Number(o.payment_amount) || 0);
      if (o.order_status === "completed") {
        if (ts >= t0) todaySales += pay;
        if (ts >= t7) weekSales += pay;
      }
      if (ts >= t7) {
        denomWeek += 1;
        if (o.order_status === "cancelled") cancelWeek += 1;
      }
    }
    let settlementScheduled = 0;
    let settlementPaid = 0;
    let settlementHeld = 0;
    for (const s of settlements) {
      const amt = Math.round(Number(s.settlement_amount) || 0);
      if (s.settlement_status === "scheduled" || s.settlement_status === "processing") {
        settlementScheduled += amt;
      } else if (s.settlement_status === "paid") {
        settlementPaid += amt;
      } else if (s.settlement_status === "held") {
        settlementHeld += amt;
      }
    }
    return {
      todaySalesPhp: todaySales,
      weekSalesPhp: weekSales,
      cancelCount: cancelWeek,
      cancelRatePercent: denomWeek > 0 ? Math.round((cancelWeek / denomWeek) * 100) : 0,
      settlementScheduledPhp: settlementScheduled,
      settlementPaidPhp: settlementPaid,
      settlementHeldPhp: settlementHeld,
    };
  }, [orders, settlements]);

  const priorityCards = useMemo(() => {
    const cards: Array<{
      title: string;
      description: string;
      href: string;
      badge?: string;
      tone?: "default" | "accent" | "danger" | "warning";
    }> = [];

    if (canSell && row.is_visible) {
      cards.push({
        title: "신규 · 환불 요청 주문",
        description: "접수 대기·환불 요청을 바로 확인하고 상태를 바꿉니다.",
        href: buildStoreOrdersHref({ storeId: row.id, tab: "new" }),
        badge: orderAlertsBadge > 0 ? String(orderAlertsBadge > 99 ? "99+" : orderAlertsBadge) : undefined,
        tone: orderAlertsBadge > 0 ? "accent" : "default",
      });
    }

    if (meta.refund_requested > 0) {
      cards.push({
        title: "환불 처리 대기",
        description: "구매자 환불 요청 건이 있습니다. 주문 상세에서 상태를 확인하세요.",
        href: buildStoreOrdersHref({ storeId: row.id, tab: "refund" }),
        badge: String(meta.refund_requested),
        tone: "warning",
      });
    }

    if (meta.pending_delivery > 0) {
      cards.push({
        title: "배달 접수 대기",
        description: "배달 주문이 대기 중입니다. 픽업·배송 단계를 진행해 주세요.",
        href: buildStoreOrdersHref({ storeId: row.id, tab: "new" }),
        badge: String(meta.pending_delivery),
        tone: "danger",
      });
    }

    if (openInquiryCount > 0) {
      cards.push({
        title: "미응답 문의",
        description: "고객 문의에 답변이 필요합니다.",
        href: inquiriesHref,
        badge: String(openInquiryCount),
        tone: "accent",
      });
    }

    if (soldOutProducts > 0) {
      cards.push({
        title: "품절 메뉴",
        description: "품절 표시된 상품을 확인하고 재고를 정리하세요.",
        href: productsHubHref,
        badge: String(soldOutProducts),
        tone: "warning",
      });
    }

    cards.push({
      title: "운영 · 심사 상태",
      description: "공개 노출, 판매 승인, 배달 설정을 점검합니다.",
      href: `/my/business/ops-status?${q}`,
      tone: "default",
    });

    return cards;
  }, [
    canSell,
    row.is_visible,
    orderAlertsBadge,
    meta.refund_requested,
    meta.pending_delivery,
    openInquiryCount,
    soldOutProducts,
    row.id,
    inquiriesHref,
    productsHubHref,
    q,
  ]);

  const quickLinks = useMemo(
    () => [
      { label: "주문 관리", href: ordersBaseHref },
      { label: "상품 등록", href: productsHubHref },
      { label: "카테고리", href: `/my/business/menu-categories?${q}` },
      { label: "영업시간 · 휴무", href: `/my/business/profile?${q}` },
      { label: "공지 · 소개", href: `/my/business/profile?${q}` },
      { label: "배달 알림음 안내", href: `/my/business/settings?${q}` },
      ...(row.slug && row.is_visible
        ? [{ label: "공개 페이지", href: `/stores/${encodeURIComponent(row.slug)}` }]
        : []),
    ],
    [q, productsHubHref, ordersBaseHref, row.slug, row.is_visible]
  );

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} relative`}>
      <BusinessDashboardMobileBar
        storeOrdersHref={buildStoreOrdersHref({ storeId: row.id, tab: "new" })}
        inquiriesHref={inquiriesHref}
        orderBadge={orderAlertsBadge}
        inquiryOpenCount={openInquiryCount}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-medium text-gray-500">매장 운영 센터</p>
          <p className="text-[18px] font-bold text-gray-900">지금 처리할 일을 먼저 확인하세요</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadRemote();
            void loadDashboard();
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-700"
        >
          새로고침
        </button>
      </div>

      {row.approval_status === "approved" && !canSell ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          고객에게 판매 노출을 하려면 관리자 <strong>판매 승인</strong>이 필요합니다. 그 전에는 초안·숨김으로 상품을
          준비해 두세요.
        </p>
      ) : null}

      {dashLoading ? <p className="text-[14px] text-gray-500">대시보드 데이터 불러오는 중…</p> : null}

      <BusinessDashboardKpiStrip
        kpi={kpi}
        ordersBaseHref={ordersBaseHref}
        inquiriesHref={inquiriesHref}
        productsHubHref={productsHubHref}
        settlementsHref={settlementsHref}
      />

      <BusinessDashboardPriorityCards cards={priorityCards} />

      <BusinessDashboardOrderTimeline storeId={row.id} orders={timelineOrders} />

      <BusinessDashboardQuickRow links={quickLinks} />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <BusinessOwnerOpsStrip row={row} profile={profile} canSell={canSell} />
        <Link
          href={`/my/business/ops-status?${q}`}
          className="mt-3 inline-block text-[13px] font-medium text-signature"
        >
          운영 상세 보기
        </Link>
      </div>

      <BusinessDashboardInsights
        todaySalesPhp={insights.todaySalesPhp}
        weekSalesPhp={insights.weekSalesPhp}
        cancelCount={insights.cancelCount}
        cancelRatePercent={insights.cancelRatePercent}
        settlementScheduledPhp={insights.settlementScheduledPhp}
        settlementPaidPhp={insights.settlementPaidPhp}
        settlementHeldPhp={insights.settlementHeldPhp}
      />
    </div>
  );
}
