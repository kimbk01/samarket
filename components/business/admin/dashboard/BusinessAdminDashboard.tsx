"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSupabaseStoreOrdersRealtime } from "@/hooks/useSupabaseStoreOrdersRealtime";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { fetchStoreOrdersListDeduped } from "@/lib/stores/fetch-store-orders-list-deduped";
import type { BusinessProduct, BusinessProfile } from "@/lib/types/business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { BusinessDashboardKpiStrip, type DashboardKpi } from "@/components/business/admin/dashboard/BusinessDashboardKpiStrip";
import { BusinessDashboardOrderTimeline, type TimelineOrder } from "@/components/business/admin/dashboard/BusinessDashboardOrderTimeline";
import { BusinessDashboardQuickRow } from "@/components/business/admin/dashboard/BusinessDashboardQuickRow";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { usePullToRefreshAtDocumentTop } from "@/lib/ui/use-pull-to-refresh-document-top";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type InquiryRow = { id: string; status: string };

function isTerminalOrderStatus(s: string): boolean {
  return s === "completed" || s === "cancelled" || s === "refunded";
}

export function BusinessAdminDashboard({
  row,
  profile: _profile,
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
  const { t } = useI18n();
  const q = `storeId=${encodeURIComponent(row.id)}`;
  const ordersBaseHref = buildStoreOrdersHref({ storeId: row.id });
  const inquiriesHref = `/stores/owner/inquiries?${q}`;
  const productsHubHref = `/stores/owner/products?${q}`;

  const [orders, setOrders] = useState<TimelineOrder[]>([]);
  const [meta, setMeta] = useState({
    pending_accept: 0,
    refund_requested: 0,
    pending_delivery: 0,
  });
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);

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

  const loadDashboard = useCallback(async (_opts?: { silent?: boolean }) => {
    try {
      const [oj, ir] = await Promise.all([
        fetchStoreOrdersListDeduped(row.id),
        runSingleFlight(`me:stores:${row.id}:inquiries:get`, () =>
          fetch(`/api/me/stores/${encodeURIComponent(row.id)}/inquiries`, { credentials: "include" })
        ),
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
    } catch {
      setOrders([]);
      setInquiries([]);
    }
  }, [row.id]);

  useSupabaseStoreOrdersRealtime(row.id, {
    debounceMs: 450,
    onChange: () => void loadDashboard({ silent: true }),
    onInsert: onStoreOrderInsert,
  });

  useEffect(() => {
    void loadDashboard({ silent: true });
  }, [loadDashboard]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void loadDashboard({ silent: true });
    }, 45_000);
    return () => window.clearInterval(id);
  }, [loadDashboard]);

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([loadRemote(), loadDashboard({ silent: true })]);
  }, [loadRemote, loadDashboard]);

  const { pullPx, refreshing, willReleaseRefresh } = usePullToRefreshAtDocumentTop(handlePullRefresh);

  const openInquiryCount = useMemo(
    () => inquiries.filter((r) => r.status === "open").length,
    [inquiries]
  );

  const soldOutProducts = useMemo(
    () => products.filter((p) => p.status === "sold_out").length,
    [products]
  );

  const refundRequestedTotal = useMemo(() => {
    const inSample = orders.filter((o) => o.order_status === "refund_requested").length;
    /** API `meta.refund_requested_count`는 전체 원장 기준(목록 100건 제한과 무관). 목록과 교차해 최소한 샘플 내 건도 반영 */
    return Math.max(meta.refund_requested, inSample);
  }, [orders, meta.refund_requested]);

  const kpi: DashboardKpi = useMemo(() => {
    let inProgress = 0;
    let todaySales = 0;
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    const t0ms = t0.getTime();

    for (const o of orders) {
      const ts = new Date(o.created_at).getTime();
      const pay = Math.round(Number(o.payment_amount) || 0);
      if (o.order_status === "completed" && ts >= t0ms) {
        todaySales += pay;
      }
      if (
        !isTerminalOrderStatus(o.order_status) &&
        o.order_status !== "pending" &&
        o.order_status !== "refund_requested"
      ) {
        inProgress += 1;
      }
    }

    return {
      newOrders: meta.pending_accept,
      inProgress,
      refundRequested: refundRequestedTotal,
      openInquiries: openInquiryCount,
      todaySalesPhp: todaySales,
      soldOutProducts,
    };
  }, [orders, meta.pending_accept, refundRequestedTotal, openInquiryCount, soldOutProducts]);

  const timelineOrders = useMemo(() => orders.slice(0, 8), [orders]);

  const quickLinks = useMemo(
    () => [
      { label: "주문 관리", href: ordersBaseHref },
      { label: "채팅 · 문의", href: inquiriesHref },
      { label: "상품 관리 , 등록", href: productsHubHref },
      { label: "카테고리", href: `/stores/owner/menu-categories?${q}` },
      { label: "매장 설정", href: `/stores/owner/profile?${q}` },
      { label: "알림 · 운영", href: `/stores/owner/settings?${q}` },
    ],
    [q, productsHubHref, ordersBaseHref, inquiriesHref]
  );

  const alertChips = useMemo(() => {
    const chips: Array<{ label: string; href: string; tone: "neutral" | "amber" | "rose" | "signature" }> = [];
    if (canSell && row.is_visible && orderAlertsBadge > 0) {
      chips.push({
        label: `처리 필요 주문 ${orderAlertsBadge > 99 ? "99+" : orderAlertsBadge}건`,
        href: buildStoreOrdersHref({ storeId: row.id, tab: "new" }),
        tone: "signature",
      });
    }
    if (meta.pending_delivery > 0) {
      chips.push({
        label: `배달 대기 ${meta.pending_delivery}건`,
        href: buildStoreOrdersHref({ storeId: row.id, tab: "new" }),
        tone: "rose",
      });
    }
    if (openInquiryCount > 0) {
      chips.push({
        label: `미응답 문의 ${openInquiryCount}건`,
        href: inquiriesHref,
        tone: "neutral",
      });
    }
    if (soldOutProducts > 0) {
      chips.push({
        label: `품절 ${soldOutProducts}건`,
        href: productsHubHref,
        tone: "amber",
      });
    }
    return chips;
  }, [
    canSell,
    row.is_visible,
    orderAlertsBadge,
    meta.pending_delivery,
    openInquiryCount,
    soldOutProducts,
    row.id,
    inquiriesHref,
    productsHubHref,
  ]);

  const chipClass = (tone: (typeof alertChips)[0]["tone"]) => {
    if (tone === "signature")
      return "border-signature/40 bg-signature/10 text-signature hover:bg-signature/15";
    if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100/90";
    if (tone === "rose") return "border-rose-200 bg-rose-50 text-rose-950 hover:bg-rose-100/90";
    return "border-sam-border bg-sam-surface-muted text-sam-fg hover:bg-sam-app";
  };

  return (
    <div className="relative">
      {(refreshing || pullPx > 6) && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 z-10 flex justify-center"
          style={{
            top: "-0.125rem",
            transform: `translateY(${Math.min(pullPx, 56)}px)`,
          }}
        >
          <div className="flex items-center gap-2 rounded-full border border-sam-border-soft bg-sam-surface/95 px-3 py-1.5 shadow-sm backdrop-blur-sm">
            {refreshing ?
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sam-muted" aria-hidden />
                <span className="sam-text-xxs font-semibold text-sam-muted">{t("common_loading")}</span>
              </>
            : <span className="sam-text-xxs font-semibold text-sam-fg">
                {willReleaseRefresh ? "놓으면 새로고침" : "아래로 당겨 새로고침"}
              </span>}
          </div>
        </div>
      )}

      <div
        className="space-y-2"
        style={{
          transform: pullPx > 0 ? `translateY(${pullPx}px)` : undefined,
          transition: pullPx === 0 ? "transform 0.2s ease-out" : undefined,
        }}
      >
        <section
          className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
          aria-labelledby="owner-dash-order-status"
        >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sam-border-soft bg-sam-app/50 px-3 py-2 sm:px-4">
          <h2 id="owner-dash-order-status" className="sam-text-body font-bold text-sam-fg">
            주문 현황
          </h2>
          <Link
            href={ordersBaseHref}
            className="sam-text-body-secondary font-semibold text-signature hover:underline"
          >
            주문 관리
          </Link>
        </div>
        <div className="space-y-2 p-3 sm:p-4">
          <BusinessDashboardKpiStrip
            kpi={kpi}
            ordersBaseHref={ordersBaseHref}
            inquiriesHref={inquiriesHref}
            productsHubHref={productsHubHref}
            orderAlertsBadge={orderAlertsBadge}
          />
          {alertChips.length > 0 ?
            <div className="flex flex-wrap gap-2" role="list" aria-label={t("business_phase7_277")}>
              {alertChips.map((c) => (
                <Link
                  key={c.href + c.label}
                  href={c.href}
                  role="listitem"
                  className={`rounded-full border px-3 py-1.5 sam-text-xxs font-semibold transition ${chipClass(c.tone)}`}
                >
                  {c.label}
                </Link>
              ))}
            </div>
          : null}
        </div>
        </section>

        <section
          className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
          aria-labelledby="owner-dash-recent-orders"
        >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sam-border-soft bg-sam-app/50 px-3 py-2 sm:px-4">
          <h2 id="owner-dash-recent-orders" className="sam-text-body font-bold text-sam-fg">
            최근 주문
          </h2>
          <Link
            href={ordersBaseHref}
            className="sam-text-body-secondary font-semibold text-signature hover:underline"
          >
            전체 보기
          </Link>
        </div>
        <div className="p-2 sm:p-3">
          <BusinessDashboardOrderTimeline storeId={row.id} orders={timelineOrders} />
        </div>
        </section>

        <section
          className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
          aria-labelledby="owner-dash-shortcuts"
        >
        <div className="border-b border-sam-border-soft bg-sam-app/50 px-3 py-2 sm:px-4">
          <h2 id="owner-dash-shortcuts" className="sam-text-body font-bold text-sam-fg">
            바로가기
          </h2>
        </div>
        <div className="p-3 sm:p-4">
          <BusinessDashboardQuickRow links={quickLinks} />
        </div>
        </section>
      </div>
    </div>
  );
}
