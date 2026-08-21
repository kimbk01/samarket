"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DibayOverlayButton, DibayOverlayRoot } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  order_id: string;
  order_no: string;
  buyer_user_id?: string | null;
  buyer_display?: string | null;
  order_status?: string | null;
  order_completed_at?: string | null;
  gross_amount: number;
  fee_amount: number;
  settlement_amount: number;
  platform_fee_percent?: number;
  platform_fee_amount?: number;
  fixed_fee_amount?: number;
  delivery_income_amount?: number;
  refund_amount?: number;
  commission_reversal_amount?: number;
  platform_commission_revenue?: number;
  commission_base_amount?: number;
  net_settlement_amount?: number;
  settlement_status: string;
  settlement_due_date: string;
  paid_at: string | null;
  hold_reason: string | null;
  payout_method?: string | null;
  payout_reference?: string | null;
  payout_note?: string | null;
  payout_confirmed_at?: string | null;
  created_at: string;
};

type ServerSummary = {
  order_count: number;
  gross: number;
  refund: number;
  platform_commission_revenue: number;
  pending_net: number;
  paid_net: number;
  commission_reversal: number;
};

type StoreOpt = { id: string; store_name?: string | null };

type OpsMode = "paid" | "held" | "processing";

const SETTLEMENT_STATUS_OPTS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_stores_settlements_filter_all" },
  { value: "scheduled", labelKey: "admin_stores_settlements_filter_scheduled" },
  { value: "processing", labelKey: "admin_stores_settlements_filter_processing" },
  { value: "paid", labelKey: "admin_stores_settlements_filter_status_paid" },
  { value: "held", labelKey: "admin_stores_settlements_filter_held" },
  { value: "cancelled", labelKey: "admin_stores_settlements_filter_cancelled" },
];

const PAYOUT_STATUS_OPTS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_stores_settlements_filter_all" },
  { value: "paid", labelKey: "admin_stores_settlements_filter_paid_only" },
  { value: "unpaid", labelKey: "admin_stores_settlements_filter_unpaid" },
];

const PAYOUT_METHOD_OPTS: { value: string; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_stores_settlements_payout_method_select" },
  { value: "cash", labelKey: "admin_stores_settlements_payout_method_cash" },
  { value: "gcash", labelKey: "admin_stores_settlements_payout_method_gcash" },
  { value: "maya", labelKey: "admin_stores_settlements_payout_method_maya" },
  { value: "bank", labelKey: "admin_stores_settlements_payout_method_bank" },
  { value: "other", labelKey: "admin_stores_settlements_payout_method_other" },
];

function fmtDt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 19).replace("T", " ");
}

function netAmount(r: Row): number {
  return Number(r.net_settlement_amount ?? r.settlement_amount) || 0;
}

/** % fee + fixed only — delivery/reversal are separate ledger columns. */
function platformFeeSum(r: Row): number {
  return (Number(r.platform_fee_amount ?? 0) || 0) + (Number(r.fixed_fee_amount ?? 0) || 0);
}

function fmtAppliedRate(r: Row): string {
  const pct = Number(r.platform_fee_percent);
  const fixed = Math.round(Number(r.fixed_fee_amount ?? 0) || 0);
  if (!Number.isFinite(pct)) return fixed > 0 ? `— + ${fixed} PHP` : "—";
  return `${pct}% + ${fixed} PHP`;
}

function allowedModes(row: Row): Record<OpsMode, boolean> {
  const s = row.settlement_status;
  return {
    paid: s === "scheduled" || s === "processing" || s === "held",
    processing: s === "scheduled",
    held: s === "scheduled",
  };
}

export function AdminStoreSettlementsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const storeIdFromUrl = (searchParams.get("store_id") ?? "").trim();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<ServerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreOpt[]>([]);

  const [filterStoreId, setFilterStoreId] = useState(storeIdFromUrl);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterOrderNo, setFilterOrderNo] = useState("");
  const [filterSettlementStatus, setFilterSettlementStatus] = useState("");
  const [filterPayoutStatus, setFilterPayoutStatus] = useState("");
  const [filterHeldOnly, setFilterHeldOnly] = useState(false);
  const [filterUnpaidOnly, setFilterUnpaidOnly] = useState(false);
  const [filterRefundOnly, setFilterRefundOnly] = useState(false);

  useEffect(() => {
    setFilterStoreId(storeIdFromUrl);
  }, [storeIdFromUrl]);

  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [opsRow, setOpsRow] = useState<Row | null>(null);
  const [opsMode, setOpsMode] = useState<OpsMode>("paid");
  const [opsMethod, setOpsMethod] = useState("");
  const [opsRef, setOpsRef] = useState("");
  const [opsNote, setOpsNote] = useState("");
  const [opsHoldReason, setOpsHoldReason] = useState("");
  const [opsPaidAtLocal, setOpsPaidAtLocal] = useState("");
  const [opsError, setOpsError] = useState<string | null>(null);

  const settlementErrMessage = useCallback(
    (code: string) => {
      const c = code.trim();
      switch (c) {
        case "invalid_state":
          return t("admin_stores_settlements_err_invalid_state");
        case "hold_reason_required":
          return t("admin_stores_settlements_err_hold_required");
        case "invalid_status":
          return t("admin_stores_settlements_err_invalid_status");
        default:
          return c || t("admin_stores_settlements_err_failed");
      }
    },
    [t]
  );

  const payoutLabel = useCallback(
    (method: string | null | undefined) => {
      const m = String(method ?? "").trim();
      const hit = PAYOUT_METHOD_OPTS.find((o) => o.value === m);
      return hit ? t(hit.labelKey) : m || "—";
    },
    [t]
  );

  const payoutStatusLabel = useCallback(
    (r: Row) => {
      if (r.settlement_status === "paid") return t("admin_stores_settlements_payout_paid");
      if (r.settlement_status === "held") return t("admin_stores_settlements_payout_held_unpaid");
      if (r.settlement_status === "cancelled") return t("admin_stores_settlements_status_cancelled");
      return t("admin_stores_settlements_payout_unpaid");
    },
    [t]
  );

  const statusBadge = useCallback(
    (status: string) => {
      const s = status.trim();
      if (s === "held") {
        return (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 sam-text-xxs font-semibold text-amber-950">
            {t("admin_stores_settlements_status_held")}
          </span>
        );
      }
      if (s === "paid") {
        return (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 sam-text-xxs font-semibold text-emerald-900">
            {t("admin_stores_settlements_status_paid")}
          </span>
        );
      }
      if (s === "scheduled") {
        return (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 sam-text-xxs text-slate-800">
            {t("admin_stores_settlements_status_scheduled")}
          </span>
        );
      }
      if (s === "processing") {
        return (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 sam-text-xxs text-blue-900">
            {t("admin_stores_settlements_status_processing")}
          </span>
        );
      }
      if (s === "cancelled") {
        return (
          <span className="rounded-full bg-red-100 px-2 py-0.5 sam-text-xxs text-red-900">
            {t("admin_stores_settlements_status_cancelled")}
          </span>
        );
      }
      return <span className="sam-text-xxs text-sam-muted">{s}</span>;
    },
    [t]
  );

  const errorText = useMemo(() => {
    if (!error) return null;
    if (error === "forbidden") return t("admin_audit_err_no_permission");
    if (error === "table_missing") return t("admin_stores_settlements_err_table_missing");
    if (error === "network_error") return t("common_network_error");
    return error;
  }, [error, t]);

  const loadStores = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stores?status=all", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; stores?: any[] };
      if (!json?.ok || !Array.isArray(json.stores)) return;
      setStores(
        json.stores.map((s) => ({
          id: String(s.id),
          store_name: (s.store_name ?? null) as string | null,
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  const buildQuery = useCallback(() => {
    const qs = new URLSearchParams();
    if (filterStoreId.trim()) qs.set("store_id", filterStoreId.trim());
    if (filterFrom.trim()) qs.set("from", filterFrom.trim());
    if (filterTo.trim()) qs.set("to", filterTo.trim());
    if (filterOrderNo.trim()) qs.set("order_no", filterOrderNo.trim());
    if (filterSettlementStatus.trim()) qs.set("settlement_status", filterSettlementStatus.trim());
    else if (filterPayoutStatus.trim()) qs.set("payout_status", filterPayoutStatus.trim());
    if (filterHeldOnly) qs.set("held_only", "1");
    if (filterUnpaidOnly) qs.set("unpaid_only", "1");
    if (filterRefundOnly) qs.set("refund_only", "1");
    qs.set("limit", "500");
    return qs.toString();
  }, [
    filterStoreId,
    filterFrom,
    filterTo,
    filterOrderNo,
    filterSettlementStatus,
    filterPayoutStatus,
    filterHeldOnly,
    filterUnpaidOnly,
    filterRefundOnly,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery();
      const res = await fetch(`/api/admin/store-settlements?${qs}`, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("forbidden");
        setRows([]);
        setSummary(null);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "table_missing" : json?.error ?? "load_failed");
        setRows([]);
        setSummary(null);
        return;
      }
      setRows(json.settlements ?? []);
      setSummary((json.summary as ServerSummary) ?? null);
    } catch {
      setError("network_error");
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetFilters = useCallback(() => {
    setFilterStoreId("");
    setFilterFrom("");
    setFilterTo("");
    setFilterOrderNo("");
    setFilterSettlementStatus("");
    setFilterPayoutStatus("");
    setFilterHeldOnly(false);
    setFilterUnpaidOnly(false);
    setFilterRefundOnly(false);
  }, []);

  const openOps = useCallback((r: Row) => {
    const allow = allowedModes(r);
    const defaultMode: OpsMode = allow.paid ? "paid" : allow.processing ? "processing" : "held";
    setOpsRow(r);
    setOpsMode(defaultMode);
    setOpsMethod(String(r.payout_method ?? ""));
    setOpsRef(String(r.payout_reference ?? ""));
    setOpsNote(String(r.payout_note ?? ""));
    setOpsHoldReason("");
    setOpsPaidAtLocal("");
    setOpsError(null);
  }, []);

  const closeOps = useCallback(() => {
    if (busyId) return;
    setOpsRow(null);
    setOpsError(null);
  }, [busyId]);

  const submitOps = useCallback(async () => {
    if (!opsRow) return;
    const allow = allowedModes(opsRow);
    if (!allow[opsMode]) {
      setOpsError(t("admin_stores_settlements_err_ops_not_allowed"));
      return;
    }

    const id = opsRow.id;
    setBusyId(id);
    setOpsError(null);
    try {
      let body: Record<string, unknown> = {};
      if (opsMode === "paid") {
        body = {
          settlement_status: "paid",
          payout_method: opsMethod.trim() || null,
          payout_reference: opsRef.trim() || null,
          payout_note: opsNote.trim() || null,
        };
        if (opsPaidAtLocal.trim()) {
          const iso = new Date(opsPaidAtLocal).toISOString();
          body.paid_at = iso;
          body.payout_confirmed_at = iso;
        }
      } else if (opsMode === "processing") {
        body = {
          settlement_status: "processing",
          payout_method: opsMethod.trim() || null,
          payout_reference: opsRef.trim() || null,
          payout_note: opsNote.trim() || null,
        };
      } else {
        const hr = opsHoldReason.trim();
        if (!hr) {
          setOpsError(settlementErrMessage("hold_reason_required"));
          setBusyId(null);
          return;
        }
        body = {
          settlement_status: "held",
          hold_reason: hr.slice(0, 500),
          payout_method: opsMethod.trim() || null,
          payout_reference: opsRef.trim() || null,
          payout_note: opsNote.trim() || null,
        };
      }

      const res = await fetch(`/api/admin/store-settlements/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json?.ok) {
        setOpsError(settlementErrMessage(String(json?.error ?? "")));
        return;
      }
      setOpsRow(null);
      setOpsError(null);
      await load();
    } catch {
      setOpsError(t("common_network_error"));
    } finally {
      setBusyId(null);
    }
  }, [load, opsHoldReason, opsMethod, opsMode, opsNote, opsPaidAtLocal, opsRef, opsRow, settlementErrMessage, t]);

  const anyOpsOpen = opsRow !== null;

  const renderAmountBreakdown = (row: Row) => (
    <>
      {t("admin_stores_settlements_th_gross")} {formatMoneyPhp(Number(row.gross_amount) || 0)} ·{" "}
      {t("admin_stores_settlements_th_rate")}: {fmtAppliedRate(row)} ·{" "}
      {t("admin_stores_settlements_th_platform_fee")} {formatMoneyPhp(platformFeeSum(row))}
      <span className="text-sam-muted">
        {" "}
        (% {formatMoneyPhp(Number(row.platform_fee_amount ?? 0) || 0)} +{" "}
        {t("admin_stores_settlements_th_fixed")}{" "}
        {formatMoneyPhp(Number(row.fixed_fee_amount ?? 0) || 0)})
      </span>
      {" · "}
      {t("admin_stores_settlements_th_delivery")}{" "}
      {formatMoneyPhp(Number(row.delivery_income_amount ?? 0) || 0)} · {t("admin_stores_settlements_th_refund")}{" "}
      {formatMoneyPhp(Number(row.refund_amount ?? 0) || 0)}
      <div className="mt-1 font-medium text-sam-fg">
        {t("admin_stores_settlements_detail_net_label", { amount: formatMoneyPhp(netAmount(row)) })}
      </div>
      <p className="mt-1 sam-text-xxs text-sam-muted">{t("admin_stores_settlements_snapshot_note")}</p>
    </>
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_settlements" />
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_stores_settlements_desc")}</p>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-sam-fg">{t("admin_stores_settlements_filter_title")}</h2>
        <p className="mt-1 sam-text-xxs text-sam-muted">{t("admin_stores_settlements_filter_hint")}</p>
        <div className="mt-3 flex flex-wrap gap-3 sam-text-body-secondary">
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{t("admin_stores_settlements_filter_period")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="rounded border border-sam-border px-2 py-1 text-sm"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
              <span className="text-sam-muted">~</span>
              <input
                type="date"
                className="rounded border border-sam-border px-2 py-1 text-sm"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{t("admin_stores_settlements_filter_vendor")}</span>
            <select
              className="min-w-[220px] rounded border border-sam-border px-2 py-1 text-sm"
              value={filterStoreId}
              onChange={(e) => setFilterStoreId(e.target.value)}
            >
              <option value="">{t("admin_stores_settlements_filter_all")}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {String(s.store_name ?? t("common_store"))}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">{t("admin_stores_settlements_filter_order_no")}</span>
            <input
              className="min-w-[160px] rounded border border-sam-border px-2 py-1 text-sm"
              value={filterOrderNo}
              onChange={(e) => setFilterOrderNo(e.target.value)}
              placeholder={t("admin_stores_settlements_filter_order_no")}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">settlement_status</span>
            <select
              className="rounded border border-sam-border px-2 py-1 text-sm"
              value={filterSettlementStatus}
              onChange={(e) => {
                setFilterSettlementStatus(e.target.value);
                if (e.target.value) setFilterPayoutStatus("");
              }}
            >
              {SETTLEMENT_STATUS_OPTS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="sam-text-xxs text-sam-muted">payout_status</span>
            <select
              className="rounded border border-sam-border px-2 py-1 text-sm"
              value={filterPayoutStatus}
              disabled={Boolean(filterSettlementStatus)}
              onChange={(e) => setFilterPayoutStatus(e.target.value)}
            >
              {PAYOUT_STATUS_OPTS.map((o) => (
                <option key={o.value || "pall"} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={filterHeldOnly} onChange={(e) => setFilterHeldOnly(e.target.checked)} />
            held only
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={filterUnpaidOnly} onChange={(e) => setFilterUnpaidOnly(e.target.checked)} />
            unpaid only
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={filterRefundOnly} onChange={(e) => setFilterRefundOnly(e.target.checked)} />
            refund affected only
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-sam-ink px-3 py-2 text-sm font-medium text-white"
            onClick={() => void load()}
          >
            {t("admin_stores_settlements_apply_refresh")}
          </button>
          <button type="button" className="rounded border border-sam-border px-3 py-2 text-sm" onClick={resetFilters}>
            {t("admin_stores_settlements_reset_filters")}
          </button>
        </div>
      </div>

      {errorText ? <p className="text-sm text-red-700">{errorText}</p> : null}

      {summary ? (
        <div className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <p className="sam-text-xxs text-sam-muted">{t("admin_stores_settlements_summary_orders")}</p>
            <p className="font-semibold tabular-nums">{summary.order_count}</p>
          </div>
          <div>
            <p className="sam-text-xxs text-sam-muted">{t("admin_stores_settlements_th_gross")}</p>
            <p className="font-semibold tabular-nums">{formatMoneyPhp(summary.gross)}</p>
          </div>
          <div>
            <p className="sam-text-xxs text-sam-muted">{t("admin_stores_settlements_th_refund")}</p>
            <p className="font-semibold tabular-nums">{formatMoneyPhp(summary.refund)}</p>
          </div>
          <div>
            <p className="sam-text-xxs text-sam-muted">{t("admin_stores_settlements_th_platform_fee")}</p>
            <p className="font-semibold tabular-nums">{formatMoneyPhp(summary.platform_commission_revenue)}</p>
          </div>
          <div>
            <p className="sam-text-xxs text-sam-muted">{t("admin_stores_settlements_summary_pending")}</p>
            <p className="font-semibold tabular-nums">{formatMoneyPhp(summary.pending_net)}</p>
          </div>
          <div>
            <p className="sam-text-xxs text-sam-muted">{t("admin_stores_settlements_summary_paid")}</p>
            <p className="font-semibold tabular-nums">{formatMoneyPhp(summary.paid_net)}</p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">{t("admin_stores_settlements_empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
          <table className="min-w-[1280px] w-full text-left sam-text-body-secondary">
            <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
              <tr>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_id")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_order_id")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_customer")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_vendor")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_gross")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_rate")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_platform_fee")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_delivery")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_refund")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_net")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_status")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_payout_status")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_completed")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_paid_at")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_memo")}</th>
                <th className="px-2 py-2">{t("admin_stores_settlements_th_action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const held = r.settlement_status === "held";
                const net = netAmount(r);
                const completedTs = r.order_completed_at ?? r.created_at;
                return (
                  <tr key={r.id} className={`border-b border-sam-border-soft ${held ? "bg-amber-50/70" : ""}`}>
                    <td className="px-2 py-2 font-mono sam-text-xxs text-sam-muted" title={r.id}>
                      {r.id.slice(0, 10)}…
                    </td>
                    <td className="px-2 py-2 font-mono sam-text-xxs text-sam-muted" title={r.order_id}>
                      {r.order_no || `${r.order_id.slice(0, 10)}…`}
                    </td>
                    <td className="px-2 py-2 sam-text-xxs text-sam-muted" title={r.buyer_user_id ?? ""}>
                      {r.buyer_display || (r.buyer_user_id ? r.buyer_user_id.slice(0, 8) : "—")}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sam-fg">{r.store_name || "—"}</span>
                        {held ? (
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 sam-text-xxs font-semibold text-amber-950">
                            {t("admin_stores_settlements_status_held")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">{formatMoneyPhp(Number(r.gross_amount) || 0)}</td>
                    <td className="px-2 py-2 tabular-nums sam-text-xxs">{fmtAppliedRate(r)}</td>
                    <td className="px-2 py-2">
                      <span className="tabular-nums">{formatMoneyPhp(platformFeeSum(r))}</span>
                      <span className="mt-0.5 block sam-text-xxs text-sam-muted">
                        % {formatMoneyPhp(Number(r.platform_fee_amount ?? 0) || 0)} +{" "}
                        {formatMoneyPhp(Number(r.fixed_fee_amount ?? 0) || 0)}
                      </span>
                    </td>
                    <td className="px-2 py-2">{formatMoneyPhp(Number(r.delivery_income_amount ?? 0) || 0)}</td>
                    <td className="px-2 py-2">{formatMoneyPhp(Number(r.refund_amount ?? 0) || 0)}</td>
                    <td className="px-2 py-2 font-medium">
                      {net < 0 ? <span className="text-red-700">{formatMoneyPhp(net)}</span> : formatMoneyPhp(net)}
                    </td>
                    <td className="px-2 py-2">{statusBadge(r.settlement_status)}</td>
                    <td className="px-2 py-2 sam-text-xxs">{payoutStatusLabel(r)}</td>
                    <td className="px-2 py-2 sam-text-xxs text-sam-muted">{fmtDt(completedTs)}</td>
                    <td className="px-2 py-2 sam-text-xxs text-sam-muted">{fmtDt(r.paid_at)}</td>
                    <td className="px-2 py-2 max-w-[200px] sam-text-xxs">
                      {held && r.hold_reason ? (
                        <span className="font-medium text-amber-950">
                          {t("admin_stores_settlements_hold_prefix", { reason: r.hold_reason })}
                        </span>
                      ) : (
                        <span className="truncate text-sam-muted" title={r.payout_note ?? ""}>
                          {(r.payout_note ?? "").trim() || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className="rounded border border-sam-border px-2 py-1 sam-text-xxs disabled:opacity-40"
                          disabled={busyId === r.id || anyOpsOpen}
                          onClick={() => setDetailRow(r)}
                        >
                          {t("admin_stores_settlements_detail")}
                        </button>
                        {allowedModes(r).paid || allowedModes(r).processing || allowedModes(r).held ? (
                          <button
                            type="button"
                            className="rounded bg-sam-ink px-2 py-1 sam-text-xxs text-white disabled:opacity-40"
                            disabled={busyId === r.id || anyOpsOpen}
                            onClick={() => openOps(r)}
                          >
                            {t("admin_stores_settlements_payout_action")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailRow ? (
        <DibayOverlayRoot
          open
          onClose={() => setDetailRow(null)}
          dismissible
          placement="center"
          zRole="dialog"
        >
          <div
            className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
            aria-labelledby="settlement-detail-title"
          >
            <h2 id="settlement-detail-title" className={OverlayUi.title}>
              {t("admin_stores_settlements_detail_title")}
            </h2>
            <dl className="mt-3 space-y-2 sam-text-body-secondary">
              <div>
                <dt className="text-sam-muted">{t("admin_stores_settlements_th_id")}</dt>
                <dd className="break-all font-mono sam-text-xxs">{detailRow.id}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_settlements_th_order_id")}</dt>
                <dd className="break-all font-mono sam-text-xxs">{detailRow.order_id}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_settlements_th_vendor")}</dt>
                <dd>{detailRow.store_name}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_settlements_detail_amount")}</dt>
                <dd>{renderAmountBreakdown(detailRow)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_settlements_detail_status")}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {statusBadge(detailRow.settlement_status)}
                  <span className="sam-text-xxs text-sam-muted">
                    {t("admin_stores_settlements_detail_payout_status", {
                      status: payoutStatusLabel(detailRow),
                    })}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_settlements_detail_due")}</dt>
                <dd>{detailRow.settlement_due_date}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_settlements_detail_completed_at")}</dt>
                <dd className="font-mono sam-text-xxs">{fmtDt(detailRow.order_completed_at ?? detailRow.created_at)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{t("admin_stores_settlements_detail_payout")}</dt>
                <dd className="sam-text-xxs">
                  {payoutLabel(detailRow.payout_method)} · {detailRow.payout_reference ?? "—"}
                  <div>paid_at {fmtDt(detailRow.paid_at)}</div>
                  <div>payout_confirmed_at {fmtDt(detailRow.payout_confirmed_at)}</div>
                </dd>
              </div>
              {detailRow.hold_reason ? (
                <div>
                  <dt className="text-sam-muted">{t("admin_stores_settlements_detail_hold_reason")}</dt>
                  <dd className="text-amber-950">{detailRow.hold_reason}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-sam-muted">{t("admin_stores_settlements_detail_ops_memo")}</dt>
                <dd className="whitespace-pre-wrap break-words">{detailRow.payout_note ?? "—"}</dd>
              </div>
            </dl>
            <div className={`${OverlayUi.actionsStack} mt-4`}>
              <DibayOverlayButton roleTone="secondary" onClick={() => setDetailRow(null)}>
                {t("common_close")}
              </DibayOverlayButton>
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}

      {opsRow ? (
        <DibayOverlayRoot
          open
          onClose={busyId ? undefined : closeOps}
          dismissible={!busyId}
          placement="center"
          zRole="nested"
        >
          <div
            className={`${OverlayUi.dialogPanel} !max-w-lg max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={OverlayUi.title}>{t("admin_stores_settlements_payout_modal_title")}</h2>
            <p className={`mt-2 ${OverlayUi.caption}`}>
              {t("admin_stores_settlements_payout_modal_summary", {
                store: opsRow.store_name,
                order: opsRow.order_no || opsRow.order_id.slice(0, 12),
                amount: formatMoneyPhp(netAmount(opsRow)),
              })}
            </p>

            <div className="mt-3 space-y-2 rounded-ui-rect border border-sam-border-soft bg-sam-app p-3 sam-text-xxs text-sam-muted">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="opsMode"
                  checked={opsMode === "paid"}
                  disabled={!allowedModes(opsRow).paid}
                  onChange={() => setOpsMode("paid")}
                />
                {t("admin_stores_settlements_ops_paid")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="opsMode"
                  checked={opsMode === "processing"}
                  disabled={!allowedModes(opsRow).processing}
                  onChange={() => setOpsMode("processing")}
                />
                {t("admin_stores_settlements_ops_processing")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="opsMode"
                  checked={opsMode === "held"}
                  disabled={!allowedModes(opsRow).held}
                  onChange={() => setOpsMode("held")}
                />
                {t("admin_stores_settlements_ops_held")}
              </label>
            </div>

            {opsMode === "paid" && opsRow.settlement_status === "held" ? (
              <p className="mt-3 rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
                {t("admin_stores_settlements_warn_held_to_paid")}
              </p>
            ) : null}
            {opsMode === "paid" && Number(opsRow.refund_amount ?? 0) > 0 ? (
              <p className="mt-2 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
                {t("admin_stores_settlements_warn_refund")}
              </p>
            ) : null}

            <label className="mt-3 block text-xs font-medium text-sam-muted">
              {t("admin_stores_settlements_payout_method")}
            </label>
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              value={opsMethod}
              disabled={Boolean(busyId)}
              onChange={(e) => setOpsMethod(e.target.value)}
            >
              {PAYOUT_METHOD_OPTS.map((o) => (
                <option key={o.value || "pm-none"} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-xs font-medium text-sam-muted">
              {t("admin_stores_settlements_payout_reference")}
            </label>
            <input
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              value={opsRef}
              disabled={Boolean(busyId)}
              onChange={(e) => setOpsRef(e.target.value)}
              placeholder={t("admin_stores_settlements_payout_ref_ph")}
            />

            <label className="mt-3 block text-xs font-medium text-sam-muted">
              {t("admin_stores_settlements_ops_memo_label")}
            </label>
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
              rows={3}
              value={opsNote}
              disabled={Boolean(busyId)}
              onChange={(e) => setOpsNote(e.target.value)}
              placeholder={t("admin_stores_settlements_ops_memo_ph")}
            />

            {opsMode === "paid" ? (
              <>
                <label className="mt-3 block text-xs font-medium text-sam-muted">
                  {t("admin_stores_settlements_paid_at_label")}
                </label>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
                  value={opsPaidAtLocal}
                  disabled={Boolean(busyId)}
                  onChange={(e) => setOpsPaidAtLocal(e.target.value)}
                />
                <p className="mt-1 sam-text-xxs text-sam-muted">{t("admin_stores_settlements_paid_at_hint")}</p>
              </>
            ) : null}

            {opsMode === "held" ? (
              <>
                <label className="mt-3 block text-xs font-medium text-amber-900">
                  {t("admin_stores_settlements_hold_reason_label")}
                </label>
                <textarea
                  className="mt-1 w-full rounded-ui-rect border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm"
                  rows={3}
                  value={opsHoldReason}
                  disabled={Boolean(busyId)}
                  onChange={(e) => setOpsHoldReason(e.target.value)}
                  placeholder={t("admin_stores_settlements_hold_reason_ph")}
                />
              </>
            ) : null}

            {opsError ? (
              <p className="mt-3 rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
                {opsError}
              </p>
            ) : null}

            <div className={`${OverlayUi.actionsRow} mt-4`}>
              <DibayOverlayButton roleTone="secondary" disabled={Boolean(busyId)} onClick={() => closeOps()}>
                {t("common_cancel")}
              </DibayOverlayButton>
              <DibayOverlayButton
                roleTone="primary"
                disabled={Boolean(busyId)}
                loading={Boolean(busyId)}
                onClick={() => void submitOps()}
              >
                {t("common_confirm")}
              </DibayOverlayButton>
            </div>
          </div>
        </DibayOverlayRoot>
      ) : null}
    </div>
  );
}
