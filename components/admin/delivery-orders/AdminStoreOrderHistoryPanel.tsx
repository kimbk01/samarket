"use client";

/**
 * 주문 상세 — 상태 이력 · 배달 진행 · 수수료 정산 (읽기 전용).
 * Data: GET /api/admin/store-orders/[orderId]/history. Commission row = settlement ledger SQL.
 */
import { adminOperatorErrorMessage, adminOperatorLabel } from "@/lib/admin/operator-ux/operator-labels";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  CommissionRowMoney,
  CommissionStateChip,
  ROW_ACTION_BTN,
  type CommissionLang,
} from "@/components/stores/commission/StoreCommissionLedgerParts";
import type { StoreCommissionLedgerRow } from "@/lib/stores/commission/load-store-commission-ledger";
import { formatManilaDateTime } from "@/lib/stores/commission/store-commission-ledger-query";
import type { StoreOrderDeliveryStatus } from "@/lib/stores/store-order-delivery-status";

type EventRow = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_role: string | null;
  message: string | null;
  created_at: string;
};

type DeliveryRow = {
  delivery_status: string;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
};

type History = {
  events: EventRow[];
  delivery: DeliveryRow | null;
  commission: StoreCommissionLedgerRow | null;
  commission_error: string | null;
};

const ACTOR_LABEL: Record<string, { ko: string; en: string }> = {
  buyer: { ko: "구매자", en: "Buyer" },
  owner: { ko: "매장", en: "Store" },
  admin: { ko: "관리자", en: "Admin" },
  system: { ko: "시스템", en: "System" },
};

const EVENT_LABEL: Record<string, { ko: string; en: string }> = {
  cancel_approved: { ko: "취소 요청 승인", en: "Cancel request approved" },
  cancel_rejected: { ko: "취소 요청 반려", en: "Cancel request rejected" },
  delivery_status_changed: { ko: "배달 상태 변경", en: "Delivery status changed" },
  order_payment_failed_buyer: { ko: "결제 실패", en: "Payment failed" },
};

const DELIVERY_LABEL: Record<StoreOrderDeliveryStatus, { ko: string; en: string }> = {
  waiting_rider: { ko: "라이더 대기", en: "Waiting for rider" },
  rider_assigned: { ko: "라이더 배정", en: "Rider assigned" },
  pickup_in_progress: { ko: "픽업 중", en: "Picking up" },
  delivering: { ko: "배달 중", en: "Delivering" },
  delivered: { ko: "배달 완료", en: "Delivered" },
  delivery_failed: { ko: "배달 실패", en: "Delivery failed" },
};

export function AdminStoreOrderHistoryPanel({
  orderId,
  orderNo,
  statusLabel,
  reloadKey,
}: {
  orderId: string;
  orderNo: string;
  statusLabel: (status: string) => string;
  /** Changes after an intervention → re-fetch. */
  reloadKey: number;
}) {
  const { language, t } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const ko = lang === "ko";
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/history`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<History>;
      if (!res.ok || j.ok !== true) {
        throw new Error(res.status === 403 ? "forbidden" : typeof j.error === "string" ? j.error : "load_failed");
      }
      setData({
        events: Array.isArray(j.events) ? j.events : [],
        delivery: j.delivery ?? null,
        commission: j.commission ?? null,
        commission_error: j.commission_error ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "load_failed";
      setError(msg === "Failed to fetch" ? "network_error" : msg);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const eventText = (e: EventRow) => {
    const known = EVENT_LABEL[e.event_type];
    if (known) return known[lang];
    if (e.to_status) return `${e.from_status ? `${statusLabel(e.from_status)} → ` : ""}${statusLabel(e.to_status)}`;
    return adminOperatorLabel(e.event_type, ko);
  };

  const ledgerHref = `/admin/store-settlements?order_no=${encodeURIComponent(orderNo)}&open=1`;

  return (
    <>
      <AdminCard title={t("admin_r4b_hist_commission_title")}>
        <div className="space-y-2" data-admin-order-commission="1">
          {error ? (
            <p role="alert" className="sam-text-helper text-sam-danger">
              {adminOperatorErrorMessage(error, ko)}
            </p>
          ) : !data ? (
            <p className="sam-text-helper text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p>
          ) : data.commission_error ? (
            <p role="alert" className="sam-text-helper text-sam-danger">
              {adminOperatorErrorMessage("commission_load_failed", ko)}
            </p>
          ) : data.commission ? (
            <>
              <CommissionStateChip state={data.commission.state} lang={lang} />
              <CommissionRowMoney row={data.commission} lang={lang} />
            </>
          ) : (
            <p className="sam-text-helper text-sam-muted">
              {ko
                ? "이 주문에는 수수료가 부과되지 않았습니다 (조리 시작 전 종료 또는 수수료 정책 이전 주문)."
                : "No commission was charged for this order."}
            </p>
          )}
          <Link href={ledgerHref} className={ROW_ACTION_BTN}>
            {t("admin_r4b_hist_open_commission")}
          </Link>
        </div>
      </AdminCard>

      {data?.delivery ? (
        <AdminCard title={ko ? "배달 진행" : "Delivery"}>
          <dl className="grid gap-2 sam-text-helper sm:grid-cols-2" data-admin-order-delivery="1">
            <div>
              <dt className="text-sam-muted">{ko ? "배달 상태" : "Status"}</dt>
              <dd className="text-sam-fg">
                {DELIVERY_LABEL[data.delivery.delivery_status as StoreOrderDeliveryStatus]?.[lang] ?? data.delivery.delivery_status}
              </dd>
            </div>
            {(
              [
                ["assigned_at", ko ? "라이더 배정" : "Assigned"],
                ["picked_up_at", ko ? "픽업" : "Picked up"],
                ["delivered_at", ko ? "배달 완료" : "Delivered"],
                ["failed_at", ko ? "배달 실패" : "Failed"],
              ] as const
            ).map(([k, label]) =>
              data.delivery?.[k] ? (
                <div key={k}>
                  <dt className="text-sam-muted">{label}</dt>
                  <dd className="tabular-nums text-sam-fg">{formatManilaDateTime(data.delivery[k])} PHT</dd>
                </div>
              ) : null
            )}
          </dl>
        </AdminCard>
      ) : null}

      <AdminCard title={ko ? "주문 상태 이력" : "Status history"}>
        <div className="space-y-2" data-admin-order-events="1">
          <div className="flex justify-end">
            <AdminActionButton variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {ko ? "이력 새로고침" : "Refresh history"}
            </AdminActionButton>
          </div>
          {data && data.events.length === 0 ? (
            <p className="sam-text-helper text-sam-muted">{ko ? "기록된 이력이 없습니다." : "No history recorded."}</p>
          ) : (
            <ol className="space-y-1.5">
              {(data?.events ?? []).map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-sam-border-soft pb-1.5 sam-text-helper last:border-b-0">
                  <span className="tabular-nums text-sam-muted">{formatManilaDateTime(e.created_at)}</span>
                  <span className="font-medium text-sam-fg">{eventText(e)}</span>
                  {e.actor_role ? (
                    <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs text-sam-muted">
                      {ACTOR_LABEL[e.actor_role]?.[lang] ?? e.actor_role}
                    </span>
                  ) : null}
                  {e.message ? <span className="w-full text-sam-muted">{e.message}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </AdminCard>
    </>
  );
}
