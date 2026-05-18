"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { fetchAdminStoreOrdersQueryDeduped } from "@/lib/admin/fetch-admin-store-orders-query-deduped";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";

type Row = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  buyer_user_id: string;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  created_at: string;
};

const ORDER_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  pending: "admin_stores_orders_status_pending",
  accepted: "admin_stores_orders_status_accepted",
  preparing: "admin_stores_orders_status_preparing",
  ready_for_pickup: "admin_stores_orders_status_ready_for_pickup",
  delivering: "admin_stores_orders_status_delivering",
  arrived: "admin_stores_orders_status_arrived",
  completed: "admin_stores_orders_status_completed",
  cancelled: "admin_stores_orders_status_cancelled",
  refund_requested: "admin_stores_orders_status_refund_requested",
  refunded: "admin_stores_orders_status_refunded",
};

const ORDER_FILTER_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_stores_orders_filter_all" },
  { value: "pending", labelKey: "admin_stores_orders_status_pending" },
  { value: "accepted", labelKey: "admin_stores_orders_status_accepted" },
  { value: "preparing", labelKey: "admin_stores_orders_status_preparing" },
  { value: "ready_for_pickup", labelKey: "admin_stores_orders_status_ready_for_pickup" },
  { value: "delivering", labelKey: "admin_stores_orders_status_delivering" },
  { value: "arrived", labelKey: "admin_stores_orders_status_arrived" },
  { value: "completed", labelKey: "admin_stores_orders_status_completed" },
  { value: "cancelled", labelKey: "admin_stores_orders_status_cancelled" },
  { value: "refund_requested", labelKey: "admin_stores_orders_status_refund_requested" },
  { value: "refunded", labelKey: "admin_stores_orders_status_refunded" },
];

type OrderFilters = {
  orderId: string;
  orderNo: string;
  orderStatus: string;
};

const emptyFilters: OrderFilters = {
  orderId: "",
  orderNo: "",
  orderStatus: "",
};

type Props = {
  /** URL 쿼리로 초기 필터 전달 */
  initialFilters?: Partial<OrderFilters>;
};

function buildOrdersQueryString(f: OrderFilters) {
  const params = new URLSearchParams();
  const oid = f.orderId.trim();
  const ono = f.orderNo.trim();
  const os = f.orderStatus.trim();
  if (oid) params.set("order_id", oid);
  if (ono) params.set("order_no", ono);
  if (os) params.set("order_status", os);
  return params.toString();
}

function CsvExportLink({ filters }: { filters: OrderFilters }) {
  const { t } = useI18n();
  const qs = buildOrdersQueryString(filters);
  const href = `/api/admin/store-orders/export${qs ? `?${qs}` : ""}`;
  return (
    <a
      href={href}
      className="inline-flex items-center rounded border border-sam-border bg-sam-surface px-3 py-1.5 text-sam-fg hover:bg-sam-surface-muted"
      download
    >
      {t("admin_stores_orders_csv_export")}
    </a>
  );
}

export function AdminStoreOrdersPage({ initialFilters }: Props) {
  const { t, language } = useI18n();
  const locale = catalogDateLocale(language);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrlOrderIdRef = useRef<string | null>(null);
  const headerSelectRef = useRef<HTMLInputElement>(null);

  const initial: OrderFilters = {
    orderId: (initialFilters?.orderId ?? "").trim(),
    orderNo: (initialFilters?.orderNo ?? "").trim(),
    orderStatus: (initialFilters?.orderStatus ?? "").trim(),
  };
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const hasUrlInitial =
    Boolean(initial.orderId) || Boolean(initial.orderNo) || Boolean(initial.orderStatus);
  const [applied, setApplied] = useState<OrderFilters>(() => (hasUrlInitial ? initial : emptyFilters));
  const [draft, setDraft] = useState<OrderFilters>(() => (hasUrlInitial ? initial : emptyFilters));

  const orderStatusLabel = useCallback(
    (status: string) => {
      const key = ORDER_STATUS_LABEL_KEYS[status];
      return key ? t(key) : status;
    },
    [t]
  );

  const errorText = useMemo(() => {
    if (!error) return null;
    if (error === "forbidden") return t("admin_audit_err_no_permission");
    if (error === "network_error") return t("common_network_error");
    return error;
  }, [error, t]);

  const syncDescParts = useMemo(() => {
    const linkLabel = t("admin_stores_orders_sync_link");
    const desc = t("admin_stores_orders_sync_desc");
    const idx = desc.indexOf(linkLabel);
    if (idx < 0) return { before: desc, after: "" };
    return {
      before: desc.slice(0, idx),
      after: desc.slice(idx + linkLabel.length),
    };
  }, [t]);

  const fetchWith = useCallback(async (f: OrderFilters) => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildOrdersQueryString(f);
      const { status, json: raw } = await fetchAdminStoreOrdersQueryDeduped(qs);
      const json = raw as { ok?: boolean; error?: string; orders?: Row[] };
      if (status === 403) {
        setError("forbidden");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(typeof json?.error === "string" ? json.error : "load_failed");
        setRows([]);
        return;
      }
      setRows(json.orders ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWith(applied);
  }, [applied, fetchWith]);

  useEffect(() => {
    const refetchIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void fetchWith(applied);
    };
    document.addEventListener("visibilitychange", refetchIfVisible);
    const interval = window.setInterval(refetchIfVisible, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", refetchIfVisible);
      window.clearInterval(interval);
    };
  }, [applied, fetchWith]);

  const urlOrderId = searchParams.get("order_id")?.trim() ?? "";
  useEffect(() => {
    if (urlOrderId === lastUrlOrderIdRef.current) return;
    lastUrlOrderIdRef.current = urlOrderId || null;
    if (!urlOrderId) return;
    setDraft((d) => ({ ...d, orderId: urlOrderId }));
    setApplied((d) => ({ ...d, orderId: urlOrderId }));
  }, [urlOrderId]);

  const applyFilters = useCallback(() => {
    const next = { ...draft };
    setApplied(next);
    setActionMessage(null);
    const qs = buildOrdersQueryString(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [draft, pathname, router]);

  const refreshList = useCallback(() => {
    void fetchWith(applied);
  }, [applied, fetchWith]);

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) rows.forEach((r) => next.add(r.id));
        else rows.forEach((r) => next.delete(r.id));
        return next;
      });
    },
    [rows]
  );

  const deleteSelectedFromDb = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    if (!window.confirm(t("admin_stores_orders_confirm_delete", { count: ids.length }))) {
      return;
    }
    setBulkBusy(true);
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
        setActionMessage(data.error ?? t("admin_stores_orders_delete_failed"));
        return;
      }
      const deleted: string[] = Array.isArray(data.deleted) ? data.deleted : [];
      const deletedSet = new Set(deleted);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      setRows((prev) => prev.filter((r) => !deletedSet.has(r.id)));
      if (data.errors?.length) {
        setActionMessage(
          deleted.length > 0
            ? t("admin_stores_orders_delete_partial", {
                deleted: deleted.length,
                failed: data.errors.length,
              })
            : t("admin_stores_orders_delete_all_failed", { failed: data.errors.length })
        );
      } else {
        setActionMessage(t("admin_stores_orders_deleted_count", { count: deleted.length }));
      }
      await fetchWith(applied);
    } catch {
      setActionMessage(t("common_network_error"));
    } finally {
      setBulkBusy(false);
    }
  }, [applied, fetchWith, selectedIds, t]);

  const approveRefund = useCallback(
    async (id: string) => {
      if (!window.confirm(t("admin_stores_orders_confirm_refund"))) return;
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/store-orders/${encodeURIComponent(id)}/approve-refund`, {
          method: "POST",
          credentials: "include",
        });
        const json = await res.json();
        if (!json?.ok) {
          setError(json?.error ?? "approve_refund_failed");
          return;
        }
        await fetchWith(applied);
      } catch {
        setError("network_error");
      } finally {
        setBusyId(null);
      }
    },
    [applied, fetchWith, t]
  );

  const allRowsSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someRowsSelected = rows.some((r) => selectedIds.has(r.id));
  useEffect(() => {
    const el = headerSelectRef.current;
    if (el) el.indeterminate = someRowsSelected && !allRowsSelected;
  }, [someRowsSelected, allRowsSelected]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_orders" />
      <nav className="flex flex-wrap gap-2 sam-text-helper">
        <Link
          href="/admin/stores/orders"
          className="rounded-full border border-sam-border bg-sam-surface px-3 py-1 text-sam-fg hover:border-signature hover:text-signature"
        >
          {t("admin_stores_orders_nav_delivery")}
        </Link>
        <Link
          href="/admin/order-chats"
          className="rounded-full border border-sam-border bg-sam-surface px-3 py-1 text-sam-fg hover:border-signature hover:text-signature"
        >
          {t("admin_stores_orders_nav_hub")}
        </Link>
        <Link
          href="/admin/chats/messenger"
          className="rounded-full border border-sam-border bg-sam-surface px-3 py-1 text-sam-fg hover:border-signature hover:text-signature"
        >
          {t("admin_stores_orders_nav_messenger")}
        </Link>
        <Link
          href="/admin/order-notifications"
          className="rounded-full border border-sam-border bg-sam-surface px-3 py-1 text-sam-fg hover:border-signature hover:text-signature"
        >
          {t("admin_stores_orders_nav_notif")}
        </Link>
      </nav>
      <p className="sam-text-body-secondary leading-relaxed text-sam-fg">
        {syncDescParts.before}
        <Link href="/admin/stores/orders" className="font-medium text-signature underline">
          {t("admin_stores_orders_sync_link")}
        </Link>
        {syncDescParts.after}
      </p>
      <p className="sam-text-helper text-sam-muted">{t("admin_stores_orders_refund_desc")}</p>

      <div className="flex flex-wrap items-end gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 sam-text-body-secondary">
        <label className="flex flex-col gap-0.5">
          <span className="text-sam-muted">order_id (UUID)</span>
          <input
            className="min-w-[220px] rounded border border-sam-border bg-sam-surface px-2 py-1 font-mono sam-text-helper"
            value={draft.orderId}
            onChange={(ev) => setDraft((d) => ({ ...d, orderId: ev.target.value }))}
            placeholder="UUID"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-sam-muted">{t("admin_stores_orders_filter_order_no")}</span>
          <input
            className="min-w-[140px] rounded border border-sam-border bg-sam-surface px-2 py-1"
            value={draft.orderNo}
            onChange={(ev) => setDraft((d) => ({ ...d, orderNo: ev.target.value }))}
            placeholder="SO-…"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-sam-muted">{t("admin_stores_orders_filter_status")}</span>
          <select
            className="min-w-[132px] rounded border border-sam-border bg-sam-surface px-2 py-1"
            value={draft.orderStatus}
            onChange={(ev) => setDraft((d) => ({ ...d, orderStatus: ev.target.value }))}
          >
            {ORDER_FILTER_OPTIONS.map((o) => (
              <option key={o.value ? `ord-${o.value}` : "ord-all"} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded bg-sam-ink px-3 py-1.5 text-white hover:bg-sam-surface-dark disabled:opacity-50"
          onClick={() => applyFilters()}
          disabled={loading}
        >
          {loading ? t("admin_stores_orders_querying") : t("admin_audit_query_btn")}
        </button>
        <button
          type="button"
          className="rounded border border-sam-border bg-sam-surface px-3 py-1.5 text-sam-fg hover:bg-sam-app disabled:opacity-50"
          onClick={() => refreshList()}
          disabled={loading}
        >
          {t("admin_stores_orders_refresh_list")}
        </button>
        <CsvExportLink filters={applied} />
      </div>
      <p className="sam-text-xxs text-sam-muted">{t("admin_stores_orders_csv_hint")}</p>

      {errorText ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-800">{errorText}</p>
      ) : null}
      {actionMessage ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-fg">
          {actionMessage}
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary">
          <span className="text-sam-muted">
            {t("admin_stores_orders_selected_count", { count: selectedIds.size })}
          </span>
          <button
            type="button"
            disabled={rows.length === 0 || bulkBusy}
            onClick={() => toggleSelectAll(true)}
            className="rounded border border-sam-border bg-sam-surface px-2.5 py-1.5 font-medium text-sam-fg hover:bg-sam-app disabled:opacity-40"
          >
            {t("admin_stores_orders_select_all")}
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || bulkBusy}
            onClick={() => setSelectedIds(new Set())}
            className="rounded border border-sam-border bg-sam-surface px-2.5 py-1.5 font-medium text-sam-fg hover:bg-sam-app disabled:opacity-40"
          >
            {t("admin_stores_orders_deselect")}
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || bulkBusy}
            onClick={() => void deleteSelectedFromDb()}
            className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 font-medium text-red-800 hover:bg-red-100 disabled:opacity-40"
          >
            {bulkBusy ? t("admin_stores_orders_deleting") : t("admin_stores_orders_delete_db")}
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_stores_orders_empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="min-w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border bg-sam-app text-sam-muted">
              <tr>
                <th className="w-10 px-2 py-2 text-center">
                  <input
                    ref={headerSelectRef}
                    type="checkbox"
                    checked={allRowsSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="rounded border-sam-border"
                    aria-label={t("admin_stores_orders_select_all_aria")}
                  />
                </th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_orders_th_order")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_th_store")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_orders_th_amount")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_orders_th_order_status")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_orders_th_datetime")}</th>
                <th className="px-3 py-2 font-medium">{t("admin_stores_orders_th_links")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-sam-border-soft">
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={(e) => toggleSelect(r.id, e.target.checked)}
                      className="rounded border-sam-border"
                      aria-label={t("admin_stores_orders_select_aria", { orderNo: r.order_no })}
                    />
                  </td>
                  <td className="max-w-[200px] px-3 py-2 font-mono sam-text-helper text-sam-fg">
                    <div>{r.order_no}</div>
                    <div className="break-all sam-text-xxs font-normal text-sam-meta" title={r.id}>
                      {r.id}
                    </div>
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-sam-fg">
                    {r.store_name || r.store_id}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{formatMoneyPhp(r.payment_amount)}</td>
                  <td className="px-3 py-2">{orderStatusLabel(r.order_status)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-sam-muted">
                    {new Date(r.created_at).toLocaleString(locale)}
                  </td>
                  <td className="space-y-1 px-3 py-2 align-top">
                    <div className="flex flex-col gap-1 sam-text-helper">
                      <Link
                        href={`/admin/stores/orders/${encodeURIComponent(r.id)}/chat`}
                        className="font-medium text-signature underline"
                      >
                        {t("admin_stores_orders_link_chat")}
                      </Link>
                      <Link
                        href={`/admin/chats/messenger?q=${encodeURIComponent(r.buyer_user_id)}`}
                        className="text-sam-muted underline"
                      >
                        {t("admin_stores_orders_link_messenger")}
                      </Link>
                      <Link
                        href={`/admin/stores/orders/${encodeURIComponent(r.id)}`}
                        className="text-sam-muted underline"
                      >
                        {t("admin_stores_orders_link_detail")}
                      </Link>
                    </div>
                    {r.order_status === "refund_requested" ? (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void approveRefund(r.id)}
                        className="mt-2 block w-full rounded-ui-rect border border-red-200 bg-red-50 px-2 py-1 sam-text-helper font-medium text-red-800 disabled:opacity-50"
                      >
                        {busyId === r.id ? "…" : t("admin_stores_orders_approve_refund")}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
