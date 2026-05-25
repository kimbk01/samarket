"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAppSettings } from "@/lib/admin-settings/mock-app-settings";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { formatPrice } from "@/lib/utils/format";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SETTLEMENT_STATUS_KEYS } from "@/lib/business/business-owner-ui-labels";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  order_id: string;
  order_no: string;
  gross_amount: number;
  fee_amount: number;
  settlement_amount: number;
  platform_fee_amount?: number;
  fixed_fee_amount?: number;
  delivery_income_amount?: number;
  refund_amount?: number;
  net_settlement_amount?: number;
  settlement_status: string;
  settlement_due_date: string;
  paid_at: string | null;
  hold_reason: string | null;
  payout_method?: string | null;
  payout_reference?: string | null;
  payout_confirmed_at?: string | null;
  payout_note?: string | null;
  created_at: string;
};

function formatSettlementError(
  t: ReturnType<typeof useI18n>["t"],
  code: string | null | undefined
): string {
  if (!code) return t("business_phase7_517");
  if (code === "network_error") return t("business_phase7_518");
  if (code === "table_missing") return t("business_phase7_652");
  return code;
}

export function MyStoreSettlementsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const storeIdFilter = searchParams.get("storeId")?.trim() || null;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currency = useMemo(() => getAppSettings().defaultCurrency ?? "KRW", []);
  const displayRows = useMemo(() => {
    if (!storeIdFilter) return rows;
    return rows.filter((r) => r.store_id === storeIdFilter);
  }, [rows, storeIdFilter]);

  const summary = useMemo(() => {
    let gross = 0;
    let platformFee = 0;
    let deliveryIncome = 0;
    let refund = 0;
    let pendingNet = 0;
    let paidNet = 0;
    for (const r of displayRows) {
      gross += Number(r.gross_amount) || 0;
      platformFee += (Number(r.platform_fee_amount ?? 0) || 0) + (Number(r.fixed_fee_amount ?? 0) || 0);
      deliveryIncome += Number(r.delivery_income_amount ?? 0) || 0;
      refund += Number(r.refund_amount ?? 0) || 0;
      const net = Number(r.net_settlement_amount ?? r.settlement_amount) || 0;
      const st = String(r.settlement_status ?? "");
      if (st === "paid") paidNet += net;
      else if (st === "scheduled" || st === "processing" || st === "held") pendingNet += net;
    }
    return { gross, platformFee, deliveryIncome, refund, pendingNet, paidNet };
  }, [displayRows]);

  const fmt = useCallback((n: number) => formatPrice(n, currency), [currency]);
  const settlementStatusLabel = useCallback(
    (status: string) => {
      const key = SETTLEMENT_STATUS_KEYS[status];
      return key ? t(key) : status;
    },
    [t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runSingleFlight("me:store-settlements:get", () =>
        fetch("/api/me/store-settlements", { credentials: "include" })
      );
      const json = await res.json();
      if (res.status === 401) {
        setError("login_required");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "table_missing" : String(json?.error ?? "load_failed"));
        setRows([]);
        return;
      }
      setRows(json.settlements ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="pb-8">
      <div className={`${OWNER_STORE_STACK_Y_CLASS}`}>
        {error ? (
          <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "login_required" ? t("common_login_required") : formatSettlementError(t, error)}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-sam-muted">{t("common_loading")}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 text-sm text-sam-muted">
            {t("business_phase7_641")}
          </p>
        ) : displayRows.length === 0 ? (
          <p className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 text-sm text-sam-muted">
            {t("business_phase7_642")}
          </p>
        ) : (
          <ul className="space-y-2">
            <li className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
              <p className="text-sm font-semibold text-sam-fg">{t("business_phase7_253")}</p>
              <p className="mt-1 sam-text-xxs text-sam-muted">
                {t("business_phase7_643")}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-ui-rect border border-sam-border-soft px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{t("business_phase7_288")}</p>
                  <p className="text-base font-semibold text-sam-fg">{fmt(summary.gross)}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border-soft px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{t("business_phase7_319")}</p>
                  <p className="text-base font-semibold text-sam-fg">{fmt(summary.platformFee)}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border-soft px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{t("business_phase7_117")}</p>
                  <p className="text-base font-semibold text-sam-fg">{fmt(summary.deliveryIncome)}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border-soft px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{t("business_phase7_330")}</p>
                  <p className="text-base font-semibold text-sam-fg">{fmt(summary.refund)}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border-soft px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{t("business_phase7_251")}</p>
                  <p className="text-base font-semibold text-sam-fg">{fmt(summary.pendingNet)}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border-soft px-3 py-2">
                  <p className="sam-text-xxs text-sam-muted">{t("business_phase7_252")}</p>
                  <p className="text-base font-semibold text-emerald-800">{fmt(summary.paidNet)}</p>
                </div>
              </div>
              <p className="mt-2 sam-text-xxs text-sam-muted">
                {t("business_phase7_644")}
              </p>
            </li>
            {storeIdFilter ? (
              <li className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-helper text-sam-muted">
                {t("business_phase7_645")}{" "}
                <Link href="/stores/owner/settlements" className="font-medium text-signature underline">
                  {t("business_phase7_646")}
                </Link>
              </li>
            ) : null}
            {displayRows.map((r) => (
              <li key={r.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-sm font-medium text-sam-fg">{r.store_name}</span>
                  <span className="text-xs text-sam-muted">
                    {settlementStatusLabel(r.settlement_status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-sam-muted">
                  {t("business_phase7_647", {
                    v1: r.order_no || r.order_id.slice(0, 8),
                    v2: r.settlement_due_date,
                  })}
                </p>
                <p className="mt-2 text-lg font-semibold text-sam-fg">
                  {fmt(Number(r.settlement_amount) || 0)}
                </p>
                <p className="sam-text-xxs text-sam-meta">
                  {t("business_phase7_648", {
                    v1: fmt(Number(r.gross_amount) || 0),
                    v2: fmt(Number(r.fee_amount) || 0),
                    v3: fmt(Number(r.refund_amount ?? 0) || 0),
                  })}
                </p>
                <p className="mt-1 sam-text-xxs text-sam-muted">
                  {t("business_phase7_649", {
                    v1: fmt(Number(r.platform_fee_amount ?? 0) || 0),
                    v2: fmt(Number(r.fixed_fee_amount ?? 0) || 0),
                    v3: fmt(Number(r.delivery_income_amount ?? 0) || 0),
                  })}{" "}
                  <span className="font-medium text-sam-fg">
                    {fmt(Number(r.net_settlement_amount ?? r.settlement_amount) || 0)}
                  </span>
                </p>
                {r.hold_reason ? (
                  <p className="mt-2 text-xs text-amber-800">{t("business_phase7_126", { v1: r.hold_reason })}</p>
                ) : null}
                {r.paid_at ? (
                  <p className="mt-1 text-xs text-green-700">{t("business_phase7_283", { v1: r.paid_at.slice(0, 10) })}</p>
                ) : null}
                {r.payout_confirmed_at ? (
                  <p className="mt-1 text-xs text-sam-muted">
                    {t("business_phase7_650", { v1: r.payout_confirmed_at.slice(0, 10) })}
                    {r.payout_method ? ` · ${r.payout_method}` : ""}
                    {r.payout_reference ? ` · ${r.payout_reference}` : ""}
                  </p>
                ) : null}
                <Link
                  href={buildStoreOrdersHref({ storeId: r.store_id })}
                  className="mt-2 inline-block text-xs text-signature"
                >
                  {t("business_phase7_651")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
