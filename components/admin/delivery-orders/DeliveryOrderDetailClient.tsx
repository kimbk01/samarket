"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { fetchAdminStoreOrderDetailDeduped } from "@/lib/admin/fetch-admin-store-order-detail";
import type { AdminDeliveryOrder, OrderStatusLog } from "@/lib/admin/delivery-orders-admin/types";
import {
  AdminActionStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  SettlementStatusBadge,
} from "./DeliveryOrderBadges";
import { AdminOrderTimeline } from "./AdminOrderTimeline";
import { OrderAmountCard } from "./OrderAmountCard";
import { OrderDetailCard } from "./OrderDetailCard";
import { OrderItemsTable } from "./OrderItemsTable";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useSupabaseStoreOrderRowRealtime } from "@/hooks/useSupabaseStoreOrderRowRealtime";
import { useSupabaseStoreOrderDeliveriesRealtime } from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type AuditRow = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  created_at: string;
  before_json: unknown;
  after_json: unknown;
};

export function DeliveryOrderDetailClient({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<AdminDeliveryOrder | null>(null);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const id = orderId.trim();
    if (!id) {
      setOrder(null);
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const { order: fromDb } = await fetchAdminStoreOrderDetailDeduped(id);
      setOrder(fromDb ?? null);
    } catch {
      setOrder(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [orderId]);

  useSupabaseStoreOrderRowRealtime(orderId.trim() || null, {
    debounceMs: 400,
    onChange: () => void reload({ silent: true }),
  });

  useSupabaseStoreOrderDeliveriesRealtime(
    orderId.trim() ? { kind: "order", orderId } : null,
    { debounceMs: 450, onChange: () => void reload({ silent: true }) }
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const [opBusy, setOpBusy] = useState(false);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const loadAudit = useCallback(async () => {
    const id = orderId.trim();
    if (!id) return;
    setAuditLoading(true);
    try {
      const res = await fetch(
        `/api/admin/audit-logs?target_type=store_order&target_id=${encodeURIComponent(id)}&limit=80`,
        { credentials: "include" }
      );
      const j = (await res.json()) as {
        ok?: boolean;
        logs?: AuditRow[];
      };
      setAuditRows(Array.isArray(j.logs) ? j.logs : []);
    } catch {
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    setNoteDraft(order.adminNote ?? "");
  }, [order?.id, order?.adminNote]);

  useEffect(() => {
    if (!order?.id) return;
    void loadAudit();
  }, [order?.id, loadAudit]);

  const runAdminPatch = useCallback(
    async (body: Record<string, unknown>) => {
      const id = orderId.trim();
      if (!id) return;
      setOpBusy(true);
      try {
        const res = await fetch(`/api/admin/store-orders/${encodeURIComponent(id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!j?.ok) {
          window.alert(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
          return;
        }
        await reload({ silent: true });
        await loadAudit();
      } finally {
        setOpBusy(false);
      }
    },
    [orderId, reload, loadAudit]
  );

  const timelineLogs = useMemo<OrderStatusLog[]>(
    () =>
      auditRows.map((r) => ({
        id: r.id,
        orderId: order?.id ?? orderId.trim(),
        actorType:
          r.actor_type === "admin"
            ? "admin"
            : r.actor_type === "system"
              ? "system"
              : "buyer",
        actorId: r.actor_id ?? "—",
        action: r.action,
        createdAt: r.created_at,
      })),
    [auditRows, order?.id, orderId]
  );

  if (loading) {
    return (
      <div className="p-6">
        <AdminPageHeader titleKey="admin_do_detail_title" backHref="/admin/stores/orders" />
        <p className="text-sm text-sam-muted">{t("admin_do_common_ledger_loading")}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <AdminPageHeader titleKey="admin_do_detail_title" backHref="/admin/stores/orders" />
        <p className="text-sm text-sam-muted">{t("admin_do_detail_not_found")}</p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">
          <Link href={`/admin/store-orders?order_id=${encodeURIComponent(orderId)}`} className="text-signature underline">
            {t("admin_do_detail_search_hint")}
          </Link>
        </p>
      </div>
    );
  }

  const cancelState =
    order.cancelRequest?.status === "pending"
      ? t("admin_do_cancel_pending")
      : order.cancelRequest?.status === "approved"
        ? t("admin_do_cancel_approved")
        : order.cancelRequest?.status === "rejected"
          ? t("admin_do_cancel_rejected")
          : order.orderStatus === "cancelled"
            ? t("admin_do_cancel_done")
            : "—";

  const refundState =
    order.refundRequest?.status === "pending"
      ? t("admin_do_refund_pending")
      : order.refundRequest?.status === "approved"
        ? t("admin_do_refund_approved")
        : order.refundRequest?.status === "rejected"
          ? t("admin_do_refund_rejected")
          : order.orderStatus === "refunded"
            ? t("admin_do_refund_done")
            : "—";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader title={`${t("admin_do_common_order")} ${order.orderNo}`} backHref="/admin/stores/orders" />
      <p className="rounded-ui-rect border border-emerald-200 bg-emerald-50/60 px-3 py-2 sam-text-body-secondary text-emerald-950">
        Supabase <code className="rounded bg-white/80 px-1 sam-text-helper">store_orders</code> {t("admin_do_detail_ledger_subtitle")}
      </p>

      <div className="flex flex-wrap gap-2 text-sm">
        <PaymentStatusBadge status={order.paymentStatus} />
        <OrderStatusBadge status={order.orderStatus} />
        <SettlementStatusBadge status={order.settlementStatus} />
        <AdminActionStatusBadge status={order.adminActionStatus} />
      </div>

      <p className="text-sm">
        <Link
          href={`/admin/stores/orders/${encodeURIComponent(order.id)}/chat`}
          className="font-semibold text-signature underline"
        >
          {t("admin_do_order_chat")}
        </Link>
        <span className="text-sam-muted">{t("admin_do_detail_messenger_ledger")}</span>
      </p>

      <AdminCard titleKey="admin_do_card_basic">
        <OrderDetailCard order={order} />
      </AdminCard>

      <AdminCard titleKey="admin_do_card_items">
        <OrderItemsTable items={order.items} />
      </AdminCard>

      <AdminCard titleKey="admin_do_card_amount">
        <OrderAmountCard order={order} />
      </AdminCard>

      <AdminCard titleKey="admin_do_card_status">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">{t("admin_do_dt_payment_status")}</dt>
            <dd>
              <PaymentStatusBadge status={order.paymentStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_do_dt_order_status")}</dt>
            <dd>
              <OrderStatusBadge status={order.orderStatus} />
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_do_dt_cancel_status")}</dt>
            <dd>{cancelState}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_do_dt_refund_status")}</dt>
            <dd>{refundState}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_do_dt_settlement_status")}</dt>
            <dd>
              <SettlementStatusBadge status={order.settlementStatus} />
            </dd>
          </div>
        </dl>
      </AdminCard>

      {(order.cancelRequest || order.refundRequest) && (
        <AdminCard titleKey="admin_do_card_cancel_refund_req">
          {order.cancelRequest ? (
            <div className="mb-3 rounded border border-sam-border-soft p-2 text-sm">
              <p className="font-semibold">{t("admin_do_cancel_req", { status: order.cancelRequest.status })}</p>
              <p className="text-xs text-sam-muted">{order.cancelRequest.requestedAt}</p>
              <p className="mt-1">{order.cancelRequest.reason}</p>
            </div>
          ) : null}
          {order.refundRequest ? (
            <div className="rounded border border-sam-border-soft p-2 text-sm">
              <p className="font-semibold">
                {t("admin_do_refund_req", { status: order.refundRequest.status, by: order.refundRequest.requestedBy })}
              </p>
              <p className="text-xs text-sam-muted">{order.refundRequest.requestedAt}</p>
              <p className="mt-1">{order.refundRequest.reason}</p>
            </div>
          ) : null}
        </AdminCard>
      )}

      {(order.cancelReason || order.refundReason) && (
        <AdminCard titleKey="admin_do_card_cancel_refund_reason">
          {order.cancelReason ? <p className="text-sm">{t("admin_do_cancel_label", { reason: order.cancelReason })}</p> : null}
          {order.refundReason ? <p className="text-sm">{t("admin_do_refund_label", { reason: order.refundReason })}</p> : null}
        </AdminCard>
      )}

      {order.settlement && (
        <AdminCard titleKey="admin_do_card_settlement">
          <dl className="text-sm">
            <div className="flex justify-between">
              <dt className="text-sam-muted">{t("admin_do_dt_gross_sales")}</dt>
              <dd>{formatMoneyPhp(order.settlement.grossAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sam-muted">{t("admin_do_dt_fee")}</dt>
              <dd>{formatMoneyPhp(order.settlement.feeAmount)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>{t("admin_do_dt_settlement_due")}</dt>
              <dd>{formatMoneyPhp(order.settlement.settlementAmount)}</dd>
            </div>
            {order.settlement.scheduledDate ? (
              <p className="mt-1 text-xs text-sam-muted">{t("admin_do_dt_scheduled_date", { date: order.settlement.scheduledDate })}</p>
            ) : null}
            {order.settlement.holdReason ? (
              <p className="mt-2 rounded bg-orange-50 px-2 py-1 text-xs text-orange-900">
                {t("admin_do_dt_hold_reason", { reason: order.settlement.holdReason })}
              </p>
            ) : null}
          </dl>
        </AdminCard>
      )}

      {(order.hasReport || order.disputeMemo) && (
        <AdminCard titleKey="admin_do_card_dispute">
          {order.hasReport ? (
            <p className="text-sm text-amber-900">{t("admin_do_dispute_flag")}</p>
          ) : null}
          {order.disputeMemo ? (
            <p className="mt-2 text-sm">
              <span className="text-sam-muted">{t("admin_do_dispute_memo")}</span>
              {order.disputeMemo}
            </p>
          ) : null}
          <p className="mt-2 text-xs">
            <Link href="/admin/stores/orders/reports" className="text-signature underline">
              {t("admin_do_go_dispute_console")}
            </Link>
          </p>
        </AdminCard>
      )}

      <AdminCard titleKey="admin_do_card_platform_ops">
        <p className="sam-text-body-secondary text-sam-muted">{t("admin_do_ops_intro")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={opBusy}
            onClick={() => {
              if (!confirm(t("admin_do_confirm_force_cancel"))) return;
              void runAdminPatch({ force_cancel: true });
            }}
            className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 disabled:opacity-50"
          >
            {t("admin_do_force_cancel")}
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => {
              if (!confirm(t("admin_do_confirm_refund_request"))) return;
              void runAdminPatch({ set_order_status: "refund_requested" });
            }}
            className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 disabled:opacity-50"
          >
            {t("admin_do_refund_request")}
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => {
              if (!confirm(t("admin_do_confirm_refund_complete"))) return;
              void runAdminPatch({ complete_refund: true });
            }}
            className="rounded-ui-rect bg-sam-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("admin_do_refund_complete")}
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ admin_locked: !order.adminLocked })}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm disabled:opacity-50"
          >
            {t("admin_do_lock_toggle", { state: order.adminLocked ? t("admin_do_toggle_off") : t("admin_do_toggle_on") })}
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ admin_flagged: !order.adminFlagged })}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm disabled:opacity-50"
          >
            {t("admin_do_flag_toggle", { state: order.adminFlagged ? t("admin_do_toggle_off") : t("admin_do_toggle_on") })}
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ dispute_status: "urgent" })}
            className="rounded-ui-rect border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950 disabled:opacity-50"
          >
            {t("admin_do_urgent_flag")}
          </button>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ dispute_status: "" })}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm disabled:opacity-50"
          >
            {t("admin_do_urgent_clear")}
          </button>
        </div>
        <div className="mt-4 space-y-2">
          <label className="block text-sm">
            <span className="text-sam-muted">{t("admin_do_ops_memo")}</span>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={3}
              disabled={opBusy}
              className="mt-1 w-full rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-body text-sam-fg"
            />
          </label>
          <button
            type="button"
            disabled={opBusy}
            onClick={() => void runAdminPatch({ admin_note: noteDraft })}
            className="rounded-ui-rect bg-signature px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("admin_do_save_memo")}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-sam-border-soft pt-3">
          <Link
            href={`/admin/store-orders?order_id=${encodeURIComponent(order.id)}`}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
          >
            {t("admin_do_nav_store_orders")}
          </Link>
          <Link
            href={`/admin/stores/orders/${encodeURIComponent(order.id)}/chat`}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
          >
            {t("admin_do_order_chat")}
          </Link>
          <button
            type="button"
            disabled={auditLoading}
            onClick={() => void loadAudit()}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm disabled:opacity-50"
          >
            {t("admin_do_refresh_audit")}
          </button>
        </div>
      </AdminCard>

      <AdminCard titleKey="admin_do_card_audit_log">
        <p className="sam-text-body-secondary text-sam-muted">
          <code className="rounded bg-sam-app px-1 sam-text-helper">audit_logs</code> ·{" "}
          <code className="rounded bg-sam-app px-1 sam-text-helper">target_type=store_order</code>
        </p>
        {auditLoading ? (
          <p className="mt-2 text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>
        ) : (
          <div className="mt-2">
            <AdminOrderTimeline logs={timelineLogs} />
          </div>
        )}
      </AdminCard>

      <div className="text-center text-sm">
        <Link href={`/stores/${encodeURIComponent(order.storeSlug)}`} className="text-signature underline">
          {t("admin_do_user_store_detail")}
        </Link>
      </div>
    </div>
  );
}
