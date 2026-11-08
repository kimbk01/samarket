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
import { catalogPair } from "@/lib/i18n/catalog-pair";

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
  buyer: catalogPair("admin_r4b_chat_role_buyer"),
  owner: catalogPair("admin_store_3"),
  admin: catalogPair("admin_admin"),
  system: catalogPair("admin_system"),
};

const EVENT_LABEL: Record<string, { ko: string; en: string }> = {
  cancel_approved: catalogPair("admin_cancel_request_approved"),
  cancel_rejected: catalogPair("admin_cancel_request_rejected"),
  delivery_status_changed: catalogPair("admin_delivery_status_changed"),
  order_payment_failed_buyer: catalogPair("admin_do_ps_failed"),
};

const DELIVERY_LABEL: Record<StoreOrderDeliveryStatus, { ko: string; en: string }> = {
  waiting_rider: catalogPair("admin_waiting_for_rider"),
  rider_assigned: catalogPair("admin_rider_assigned"),
  pickup_in_progress: catalogPair("admin_picking_up"),
  delivering: catalogPair("admin_delivering"),
  delivered: catalogPair("admin_delivered"),
  delivery_failed: catalogPair("admin_delivery_failed"),
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
            <p className="sam-text-helper text-sam-muted">{t("common_loading")}</p>
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
              {t("admin_delivery_orders_no_commission_was_charged_order")}
            </p>
          )}
          <Link href={ledgerHref} className={ROW_ACTION_BTN}>
            {t("admin_r4b_hist_open_commission")}
          </Link>
        </div>
      </AdminCard>

      {data?.delivery ? (
        <AdminCard title={t("admin_delivery_orders_delivery")}>
          <dl className="grid gap-2 sam-text-helper sm:grid-cols-2" data-admin-order-delivery="1">
            <div>
              <dt className="text-sam-muted">{t("admin_delivery_orders_status")}</dt>
              <dd className="text-sam-fg">
                {DELIVERY_LABEL[data.delivery.delivery_status as StoreOrderDeliveryStatus]?.[lang] ?? data.delivery.delivery_status}
              </dd>
            </div>
            {(
              [
                ["assigned_at", t("admin_delivery_orders_assigned")],
                ["picked_up_at", t("admin_delivery_orders_picked_up")],
                ["delivered_at", t("admin_delivery_orders_delivered")],
                ["failed_at", t("admin_delivery_orders_failed")],
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

      <AdminCard title={t("admin_delivery_orders_status_history")}>
        <div className="space-y-2" data-admin-order-events="1">
          <div className="flex justify-end">
            <AdminActionButton variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {t("admin_delivery_orders_refresh_history")}
            </AdminActionButton>
          </div>
          {data && data.events.length === 0 ? (
            <p className="sam-text-helper text-sam-muted">{t("admin_delivery_orders_no_history_recorded")}</p>
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
