"use client";

import Link from "next/link";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { fetchOwnerStoreSettlementsDeduped } from "@/lib/business/fetch-owner-store-settlements-deduped";
import {
  ownerSettlementFilterLabel,
  ownerSettlementStatusLabel,
  OWNER_STORE_SETTLEMENT_STATUS_FILTERS_I18N,
} from "@/lib/business/owner-store-settlement-i18n";
import {
  ownerStoreSettlementStatusChipClass,
  type OwnerStoreSettlementStatusFilter,
} from "@/lib/business/owner-store-settlement-labels";
import type {
  OwnerStoreSettlementRow,
  OwnerStoreSettlementsMeta,
  OwnerStoreSettlementsServerSummary,
} from "@/lib/business/owner-store-settlement-types";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import {
  mapFinancialSummaryToOwner,
} from "@/lib/business/summarize-owner-store-settlements";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";

function formatSettlementDate(iso: string | null | undefined): string {
  const t = typeof iso === "string" ? iso.trim() : "";
  if (!t) return "—";
  const d = t.slice(0, 10);
  return d.replace(/-/g, ". ");
}

function SettlementRowCard({
  row,
  t,
  language,
}: {
  row: OwnerStoreSettlementRow;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  language: "ko" | "en";
}) {
  const status = String(row.settlement_status ?? "");
  const net = Number(row.net_settlement_amount ?? row.settlement_amount) || 0;
  return (
    <li className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-sam-fg">
            {t("store_owner_settlement_row_order", {
              no: row.order_no || row.order_id.slice(0, 8),
            })}
          </p>
          <p className="mt-0.5 sam-text-xxs text-sam-muted">
            {t("store_owner_settlement_due_date", {
              date: formatSettlementDate(row.settlement_due_date),
            })}
            {row.paid_at
              ? ` · ${t("store_owner_settlement_paid_at", { date: formatSettlementDate(row.paid_at) })}`
              : ""}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${ownerStoreSettlementStatusChipClass(status)}`}
        >
          {ownerSettlementStatusLabel(language, status)}
        </span>
      </div>
      <p className="mt-2 text-lg font-bold tabular-nums text-sam-fg">{formatMoneyPhp(net)}</p>
      <p className="mt-1 sam-text-xxs text-sam-muted">
        {t("store_owner_settlement_amount_line", {
          gross: formatMoneyPhp(Number(row.gross_amount) || 0),
          fee: formatMoneyPhp(Number(row.fee_amount) || 0),
          refund: formatMoneyPhp(Number(row.refund_amount ?? 0) || 0),
        })}
      </p>
      <p className="mt-0.5 sam-text-xxs text-sam-meta">
        {t("store_owner_settlement_fee_line", {
          platform: formatMoneyPhp(Number(row.platform_fee_amount ?? 0) || 0),
          fixed: formatMoneyPhp(Number(row.fixed_fee_amount ?? 0) || 0),
          delivery: formatMoneyPhp(Number(row.delivery_income_amount ?? 0) || 0),
        })}
      </p>
      <p className="mt-0.5 sam-text-xxs text-sam-meta">
        {t("store_owner_settlement_rate_line", {
          rate: `${Number(row.platform_fee_percent ?? 0) || 0}% + ${Math.round(Number(row.fixed_fee_amount ?? 0) || 0)} PHP`,
          base: formatMoneyPhp(Number(row.commission_base_amount ?? row.gross_amount) || 0),
          revenue: formatMoneyPhp(Number(row.platform_commission_revenue ?? 0) || 0),
          reversal: formatMoneyPhp(Number(row.commission_reversal_amount ?? 0) || 0),
        })}
      </p>
      {row.order_status ? (
        <p className="mt-0.5 sam-text-xxs text-sam-muted">
          {t("store_owner_settlement_order_status_line", {
            status: row.order_status,
            paid: formatMoneyPhp(Number(row.payment_amount ?? row.gross_amount) || 0),
          })}
        </p>
      ) : null}
      {row.hold_reason ? (
        <p className="mt-2 rounded-ui-rect bg-amber-50 px-2 py-1.5 sam-text-xxs text-amber-950">
          {t("store_owner_settlement_hold", { reason: row.hold_reason })}
        </p>
      ) : null}
      {row.payout_confirmed_at ? (
        <p className="mt-2 sam-text-xxs text-sam-muted">
          {t("store_owner_settlement_payout", {
            date: formatSettlementDate(row.payout_confirmed_at),
          })}
          {row.payout_method ? ` · ${row.payout_method}` : ""}
          {row.payout_reference ? ` · ${row.payout_reference}` : ""}
        </p>
      ) : null}
      <Link
        href={buildStoreOrdersHref({
          storeId: row.store_id,
          orderId: row.order_id,
        })}
        className="mt-2 inline-block sam-text-helper font-medium text-signature underline-offset-2 hover:underline"
      >
        {t("store_owner_settlement_view_order")}
      </Link>
    </li>
  );
}

/** 매장 어드민 — 정산 내역 (`/stores/owner/settlements?storeId=`) */
export function OwnerStoreSettlementsView() {
  const { t, language } = useI18n();
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";

  const [rows, setRows] = useState<OwnerStoreSettlementRow[]>([]);
  const [meta, setMeta] = useState<OwnerStoreSettlementsMeta>({});
  const [serverSummary, setServerSummary] = useState<OwnerStoreSettlementsServerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OwnerStoreSettlementStatusFilter>("all");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [orderNoQuery, setOrderNoQuery] = useState("");

  const filteredRows = rows;

  /** Authority: server summary only — client page reduce is not financial SSOT. */
  const summary = useMemo(() => {
    if (!serverSummary) return null;
    return mapFinancialSummaryToOwner(serverSummary);
  }, [serverSummary]);

  const resolveErrorMessage = useCallback(
    (code: string) => {
      if (code === "login_required") return t("mypage_comp_login_required");
      if (code === "forbidden") return t("store_owner_no_permission");
      if (code === "table_missing") return t("store_owner_settlement_err_table_missing");
      if (code === "network_error") return t("store_owner_err_network");
      if (code === "load_failed") return t("store_owner_err_load_list");
      return code;
    },
    [t]
  );

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      setRows([]);
      setServerSummary(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchOwnerStoreSettlementsDeduped({
        storeId,
        from: fromDay || null,
        to: toDay || null,
        orderNo: orderNoQuery || null,
        settlementStatus: statusFilter === "all" ? null : statusFilter,
      });
      const body = json as {
        ok?: boolean;
        error?: string;
        settlements?: OwnerStoreSettlementRow[];
        meta?: OwnerStoreSettlementsMeta;
        summary?: OwnerStoreSettlementsServerSummary | null;
      };
      if (status === 401) {
        setError("login_required");
        setRows([]);
        setServerSummary(null);
        return;
      }
      if (status === 403) {
        setError("forbidden");
        setRows([]);
        setServerSummary(null);
        return;
      }
      if (!body?.ok) {
        setError(
          body?.error === "table_missing"
            ? "table_missing"
            : typeof body?.error === "string"
              ? body.error
              : "load_failed"
        );
        setRows([]);
        setServerSummary(null);
        return;
      }
      setRows(body.settlements ?? []);
      setMeta(body.meta ?? {});
      setServerSummary(body.summary ?? null);
    } catch {
      setError("network_error");
      setRows([]);
      setServerSummary(null);
    } finally {
      setLoading(false);
    }
  }, [fromDay, orderNoQuery, statusFilter, storeId, toDay]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!storeId) {
    return (
      <div className={`mx-auto max-w-4xl ${OWNER_STORE_STACK_Y_CLASS}`}>
        <OwnerStoreAdminDashSection title={t("store_owner_settlement_guide_title")}>
          <p className="sam-text-body text-sam-muted">{t("store_owner_settlement_pick_store_body")}</p>
          <Link href={OwnerRoutes.hub()} className="inline-flex font-medium text-signature underline">
            {t("store_owner_settlement_go_hub")}
          </Link>
        </OwnerStoreAdminDashSection>
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-4xl min-w-0 ${OWNER_STORE_STACK_Y_CLASS}`}>
      <OwnerStoreAdminDashSection title={t("store_owner_settlement_guide_title")}>
        <p className="sam-text-body text-sam-muted">{t("store_owner_settlement_intro")}</p>
        {meta.settlement_delay_days != null || meta.settlement_fee_percent != null ? (
          <ul className="mt-2 list-inside list-disc sam-text-helper text-sam-muted">
            {meta.settlement_delay_days != null ? (
              <li>
                {t("store_owner_settlement_delay_days", {
                  days: String(meta.settlement_delay_days),
                })}
              </li>
            ) : null}
            {meta.settlement_fee_percent != null ? (
              <li>
                {t("store_owner_settlement_fee_rate", {
                  rate: `${meta.settlement_fee_percent}% + ${Math.round(Number(meta.settlement_fixed_fee) || 0)} PHP`,
                })}
              </li>
            ) : null}
            <li>{t("store_owner_settlement_fee_current_hint")}</li>
            {meta.settlement_fee_scope ? (
              <li>
                {t("store_owner_settlement_fee_source", {
                  source: t(
                    (
                      {
                        store: "store_owner_settlement_fee_source_store",
                        topic: "store_owner_settlement_fee_source_topic",
                        category: "store_owner_settlement_fee_source_category",
                        default: "store_owner_settlement_fee_source_default",
                        missing_policy: "store_owner_settlement_fee_source_default",
                        commerce_settings: "store_owner_settlement_fee_source_commerce_settings",
                      } as Record<string, MessageKey>
                    )[String(meta.settlement_fee_scope)] ??
                      "store_owner_settlement_fee_source_default"
                  ),
                })}
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper"
            value={fromDay}
            onChange={(e) => setFromDay(e.target.value)}
            aria-label={t("store_owner_settlement_filter_from")}
          />
          <input
            type="date"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper"
            value={toDay}
            onChange={(e) => setToDay(e.target.value)}
            aria-label={t("store_owner_settlement_filter_to")}
          />
          <input
            className="min-w-[10rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper"
            value={orderNoQuery}
            onChange={(e) => setOrderNoQuery(e.target.value)}
            placeholder={t("store_owner_settlement_filter_order_no")}
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-medium text-sam-fg disabled:opacity-50"
          >
            {loading ? t("store_owner_settlement_refreshing") : t("store_owner_refresh")}
          </button>
          <Link
            href={OwnerRoutes.orders(storeId)}
            className="rounded-ui-rect border border-signature/40 bg-signature/5 px-3 py-2 sam-text-helper font-medium text-signature"
          >
            {t("store_owner_settlement_manage_orders")}
          </Link>
        </div>
        <p className="mt-2 sam-text-xxs text-sam-muted">{t("store_owner_settlement_period_hint")}</p>
      </OwnerStoreAdminDashSection>

      {error ? (
        <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-800">
          {resolveErrorMessage(error)}
        </p>
      ) : null}

      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("store_owner_settlement_loading")}</p>
      ) : rows.length === 0 && !error ? (
        <OwnerStoreAdminDashSection title={t("store_owner_settlement_list_title")}>
          <p className="sam-text-body text-sam-muted">{t("store_owner_settlement_empty")}</p>
        </OwnerStoreAdminDashSection>
      ) : (
        <>
          <OwnerStoreAdminDashSection title={t("store_owner_settlement_summary_title")}>
            {summary ? (
              <>
            <p className="sam-text-xxs text-sam-muted">
              {meta.store_name ? `${meta.store_name} · ` : ""}
              {t("store_owner_settlement_summary_count", {
                label: ownerSettlementFilterLabel(language, statusFilter),
                count: String(summary.count),
              })}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryCell label={t("store_owner_settlement_summary_gross")} value={formatMoneyPhp(summary.gross)} />
              <SummaryCell
                label={t("store_owner_settlement_summary_platform_fee")}
                value={formatMoneyPhp(summary.platformFee)}
              />
              <SummaryCell
                label={t("store_owner_settlement_summary_delivery")}
                value={formatMoneyPhp(summary.deliveryIncome)}
              />
              <SummaryCell
                label={t("store_owner_settlement_summary_refund")}
                value={formatMoneyPhp(summary.refund)}
              />
              <SummaryCell
                label={t("store_owner_settlement_summary_pending")}
                value={formatMoneyPhp(summary.pendingNet)}
              />
              <SummaryCell
                label={t("store_owner_settlement_summary_paid")}
                value={formatMoneyPhp(summary.paidNet)}
                valueClassName="text-emerald-800"
              />
            </div>
            <p className="mt-2 sam-text-xxs text-sam-muted">{t("store_owner_settlement_summary_basis")}</p>
              </>
            ) : (
              <p className="sam-text-body text-sam-muted">{t("store_owner_settlement_loading")}</p>
            )}
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title={t("store_owner_settlement_filter_title")}>
            <div className="flex flex-wrap gap-1.5">
              {OWNER_STORE_SETTLEMENT_STATUS_FILTERS_I18N.map((id) => {
                const active = statusFilter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStatusFilter(id)}
                    className={
                      active
                        ? "rounded-full bg-signature px-3 py-1.5 sam-text-xxs font-semibold text-white"
                        : "rounded-full border border-sam-border-soft bg-sam-app px-3 py-1.5 sam-text-xxs font-medium text-sam-fg hover:bg-sam-surface-muted"
                    }
                  >
                    {ownerSettlementFilterLabel(language, id)}
                  </button>
                );
              })}
            </div>
            {filteredRows.length === 0 ? (
              <p className="mt-3 sam-text-body text-sam-muted">{t("store_owner_settlement_filter_empty")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {filteredRows.map((r) => (
                  <SettlementRowCard key={r.id} row={r} t={t} language={language} />
                ))}
              </ul>
            )}
          </OwnerStoreAdminDashSection>
        </>
      )}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  valueClassName = "text-sam-fg",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
      <p className="sam-text-xxs text-sam-muted">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${valueClassName}`}>{value}</p>
    </div>
  );
}
