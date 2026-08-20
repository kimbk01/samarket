"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  defaultOrderListFilters,
  type AdminDeliveryOrder,
  type OrderListFilters,
} from "@/lib/admin/delivery-orders-admin/types";
import { adminDeliveryOrderMatchesFilters } from "@/lib/admin/admin-delivery-order-filters";
import { DeliveryOrdersKpiCards } from "./DeliveryOrdersKpiCards";
import { DeliveryOrdersProgressPanel } from "./DeliveryOrdersProgressPanel";
import { OrderFilterBar } from "./OrderFilterBar";
import { OrderTable } from "./OrderTable";
import { invalidateAdminFetchCache } from "@/lib/admin/admin-fetch-client";
import { ADMIN_QUERY_TTL_FAST_MS } from "@/lib/admin/admin-query-ttl";
import { fetchAdminStoreOrdersListDeduped } from "@/lib/admin/fetch-admin-store-orders-deduped";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function DeliveryOrdersDashboardClient() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<OrderListFilters>(defaultOrderListFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [listHiddenIds, setListHiddenIds] = useState<Set<string>>(() => new Set());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const {
    data: dbOrdersData,
    loading: dbLoading,
    refreshing: dbRefreshing,
    error: dbQueryError,
    revalidate: revalidateDbOrders,
    mutate: mutateDbOrders,
  } = useAdminQuery<AdminDeliveryOrder[]>({
    queryKey: "admin:delivery-dashboard:store-orders-500",
    ttlMs: ADMIN_QUERY_TTL_FAST_MS,
    pollIntervalMs: 15_000,
    fetcher: async () => {
      try {
        const { status, json: jRaw } = await fetchAdminStoreOrdersListDeduped();
        const j = jRaw as {
          ok?: boolean;
          error?: string;
          orders?: { admin_delivery?: AdminDeliveryOrder }[];
        };
        if (status < 200 || status >= 300 || j?.ok === false) {
          throw new Error(typeof j?.error === "string" ? j.error : `HTTP ${status}`);
        }
        const list = Array.isArray(j.orders) ? j.orders : [];
        return list
          .map((x) => x?.admin_delivery)
          .filter((x): x is AdminDeliveryOrder => x != null && typeof x.id === "string");
      } catch (err) {
        if (err instanceof Error) throw err;
        throw new Error("network_error");
      }
    },
  });

  const dbOrders = dbOrdersData ?? [];
  const dbError =
    dbQueryError === "network_error" ? t("common_network_error") : dbQueryError;

  const filteredRows = useMemo(
    () => dbOrders.filter((o) => adminDeliveryOrderMatchesFilters(o, filters)),
    [dbOrders, filters]
  );

  const urgentRows = useMemo(() => {
    return filteredRows.filter((o) => o.needsAdminAttention === true || (o.slaWarningLevel ?? "") === "critical");
  }, [filteredRows]);

  const urgentBuckets = useMemo(() => {
    const b: Record<string, number> = {
      unassigned: 0,
      eta: 0,
      delivering: 0,
      refund: 0,
      pending: 0,
      other: 0,
    };
    for (const o of urgentRows) {
      const r = String(o.slaWarningReason ?? "").trim();
      if (r === "unassigned_over_10m") b.unassigned++;
      else if (r === "eta_overdue") b.eta++;
      else if (r === "delivery_over_60m") b.delivering++;
      else if (r === "refund_overdue") b.refund++;
      else if (r === "pending_over_5m") b.pending++;
      else b.other++;
    }
    return b;
  }, [urgentRows]);

  const visibleRows = useMemo(
    () => filteredRows.filter((o) => !listHiddenIds.has(o.id)),
    [filteredRows, listHiddenIds]
  );

  const handleToggleRow = useCallback((orderId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }, []);

  const handleToggleAllVisible = useCallback(
    (checked: boolean) => {
      const ids = visibleRows.map((o) => o.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) ids.forEach((id) => next.add(id));
        else ids.forEach((id) => next.delete(id));
        return next;
      });
    },
    [visibleRows]
  );

  const hideSelectedFromListOnly = useCallback(() => {
    if (selectedIds.size === 0) return;
    setListHiddenIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds(new Set());
    setActionMessage(t("admin_do_msg_hidden_from_list"));
  }, [selectedIds]);

  const deleteSelectedFromDb = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    if (
      !(await dibayConfirm({ title: t("admin_do_msg_delete_confirm", { count: ids.length }), confirmTone: "destructive" }))
    ) {
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/store-orders/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds: ids }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: string[];
        errors?: { id: string; message: string }[];
        error?: string;
      };
      if (!res.ok) {
        setActionMessage(data.error ?? t("admin_do_msg_delete_failed"));
        return;
      }
      const deleted: string[] = Array.isArray(data.deleted) ? data.deleted : [];
      const deletedSet = new Set(deleted);
      mutateDbOrders((prev) => (prev ?? []).filter((o) => !deletedSet.has(o.id)));
      invalidateAdminFetchCache("admin:store-orders:");
      setListHiddenIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      if (data.errors?.length) {
        const errText = data.errors.map((e) => `${e.id.slice(0, 8)}… ${e.message}`).join(" / ");
        setActionMessage(
          deleted.length > 0
            ? t("admin_do_msg_delete_partial", {
                ok: deleted.length,
                fail: data.errors.length,
                errors: errText,
              })
            : t("admin_do_msg_delete_all_failed", {
                fail: data.errors.length,
                errors: errText,
              })
        );
      } else {
        setActionMessage(t("admin_do_msg_delete_ok", { count: deleted.length }));
      }
      await revalidateDbOrders({ force: true });
    } catch {
      setActionMessage(t("admin_do_msg_delete_network"));
    } finally {
      setActionBusy(false);
    }
  }, [mutateDbOrders, revalidateDbOrders, selectedIds, t]);

  const sub = [
    { href: "/admin/stores/orders", label: t("admin_do_nav_order_list") },
    { href: "/admin/store-orders", label: t("admin_do_nav_store_orders") },
    { href: "/admin/order-chats", label: t("admin_do_nav_order_chat") },
    { href: "/admin/order-notifications", label: t("admin_do_nav_ops_alerts") },
    { href: "/admin/stores/orders/cancellations", label: t("admin_do_nav_cancellations") },
    { href: "/admin/stores/orders/refunds", label: t("admin_do_nav_refunds") },
    { href: "/admin/store-settlements", label: t("admin_do_nav_settlements") },
    { href: "/admin/store-reports", label: t("admin_do_nav_reports") },
    { href: "/admin/stores/orders/logs", label: t("admin_do_nav_logs") },
  ];

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader
        titleKey="admin_do_dashboard_title"
        descriptionKey="admin_do_dashboard_desc"
      />
      <AdminCard titleKey="admin_do_dashboard_ledger_card">
        <p className="sam-text-body-secondary leading-relaxed text-sam-fg">
          {t("admin_do_dashboard_ledger_intro")}{" "}
          <Link href="/admin/store-orders" className="font-medium text-signature underline">
            {t("admin_do_nav_store_orders")}
          </Link>
          {t("admin_do_dashboard_ledger_same_db")}
        </p>
        <p className="mt-2 sam-text-helper text-sam-muted">
          {t("admin_do_dashboard_ledger_hide_list")} {t("admin_do_dashboard_ledger_db_delete")}
        </p>
        <p className="mt-2 sam-text-helper text-sam-muted">
          <Link href="/admin/store-orders" className="text-signature underline">
            {t("admin_do_dashboard_go_store_orders")}
          </Link>
        </p>
      </AdminCard>
      <nav className="mb-4 mt-4 flex flex-wrap gap-2 text-xs">
        {sub.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-full border border-sam-border bg-sam-surface px-3 py-1 text-sam-fg hover:border-signature hover:text-signature"
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="mb-3">
        <button
          type="button"
          onClick={() => void revalidateDbOrders({ force: true })}
          disabled={dbRefreshing}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs text-sam-fg disabled:opacity-50"
        >
          {dbRefreshing ? t("admin_do_common_list_refreshing") : t("admin_do_common_list_refresh")}
        </button>
      </div>

      {dbError ? (
        <p className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {t("admin_do_dashboard_list_load_failed", { error: dbError })}
        </p>
      ) : null}

      <AdminCard titleKey="admin_do_dashboard_kpi_card">
        <DeliveryOrdersKpiCards orders={dbOrders} />
      </AdminCard>

      <AdminCard titleKey="admin_do_dashboard_urgent_card">
        <p className="sam-text-helper text-sam-muted">
          {t("admin_do_dashboard_urgent_hint")}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
            <p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_unassigned")}</p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_do_common_count_unit", { count: urgentBuckets.unassigned })}</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
            <p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_eta")}</p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_do_common_count_unit", { count: urgentBuckets.eta })}</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
            <p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_long_delivery")}</p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_do_common_count_unit", { count: urgentBuckets.delivering })}</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
            <p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_refund")}</p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_do_common_count_unit", { count: urgentBuckets.refund })}</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
            <p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_pending")}</p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_do_common_count_unit", { count: urgentBuckets.pending })}</p>
          </div>
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
            <p className="sam-text-helper font-semibold text-sam-fg">{t("admin_do_dashboard_urgent_other")}</p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_do_common_count_unit", { count: urgentBuckets.other })}</p>
          </div>
        </div>
        <p className="mt-3 sam-text-helper text-sam-muted">
          {t("admin_do_dashboard_urgent_total", { count: urgentRows.length })}
        </p>
      </AdminCard>

      <div className="mt-4">
        <DeliveryOrdersProgressPanel orders={dbOrders} filters={filters} onChange={setFilters} />
      </div>

      <div className="mt-4">
        <OrderFilterBar filters={filters} onChange={setFilters} />
      </div>

      <div className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-sam-fg">{t("admin_do_dashboard_order_list")}</h2>
        <p className="mb-2 sam-text-helper text-sam-muted">
          {t("admin_do_dashboard_stats", {
            total: dbOrders.length,
            filtered: filteredRows.length,
            visible: visibleRows.length,
          })}
          {dbRefreshing ? t("admin_do_dashboard_stats_refreshing") : ""}
        </p>
        {!dbLoading && (filteredRows.length > 0 || dbOrders.length > 0) ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary">
            <span className="text-sam-muted">
              {t("admin_do_dashboard_selected", { count: selectedIds.size })}
            </span>
            <span className="hidden sm:inline text-sam-meta">|</span>
            <button
              type="button"
              disabled={visibleRows.length === 0 || actionBusy}
              onClick={() => handleToggleAllVisible(true)}
              className="rounded border border-sam-border bg-sam-surface px-2.5 py-1.5 font-medium text-sam-fg hover:bg-sam-app disabled:opacity-40"
            >
              {t("admin_do_dashboard_select_all")}
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || actionBusy}
              onClick={() => setSelectedIds(new Set())}
              className="rounded border border-sam-border bg-sam-surface px-2.5 py-1.5 font-medium text-sam-fg hover:bg-sam-app disabled:opacity-40"
            >
              {t("admin_do_dashboard_clear_selection")}
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || actionBusy}
              onClick={hideSelectedFromListOnly}
              className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-40"
            >
              {t("admin_do_dashboard_hide_from_list")}
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || actionBusy}
              onClick={() => void deleteSelectedFromDb()}
              className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 font-medium text-red-800 hover:bg-red-100 disabled:opacity-40"
            >
              {t("admin_do_dashboard_delete_from_db")}
            </button>
          </div>
        ) : null}
        {actionMessage ? (
          <p className="mb-3 rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg">
            {actionMessage}
          </p>
        ) : null}
        {visibleRows.length === 0 && !dbLoading && filteredRows.length > 0 ? (
          <p className="py-6 text-center text-sm text-sam-muted">
            {t("admin_do_dashboard_empty_visible")}
          </p>
        ) : (
          <OrderTable
            rows={visibleRows}
            selection={{
              selectedIds,
              onToggleRow: handleToggleRow,
              onToggleAllVisible: handleToggleAllVisible,
            }}
          />
        )}
      </div>
    </div>
  );
}
