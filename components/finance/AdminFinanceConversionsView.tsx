"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFinancePeriodSums } from "@/components/finance/AdminFinancePeriodSums";
import {
  adminFinanceRangeText,
  conversionSumCells,
  readUnifiedTxSums,
  type UnifiedTxKindSum,
} from "@/lib/finance/admin-finance-period-sums";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { FinanceUnifiedTx } from "@/lib/finance/unified-transaction/types";
import {
  formatFinanceAmount,
  financeRelatedTargetLabel,
} from "@/lib/finance/presentation";
import {
  financeStoreHref,
  financeTransactionDetailHref,
  parseFinanceFilters,
} from "@/lib/finance/routes";

/** 매장 ID 는 「조회」 때 적용 (from/to 는 공통 기간 키) — 예전 FinanceFilterBar 주소 키와 같다. */
const CONVERSION_EXTRAS = ["storeId"] as const;

const FILTER_FIELD =
  "h-10 min-w-[12rem] rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]";
const FILTER_LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]";

function metaNum(meta: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    if (meta[k] == null) continue;
    const n = Number(meta[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Coin→Cash conversion operational list.
 * Uses CONVERT_FROM_STORE_POINTS cash ledger meta only — no invented outstanding/net.
 */
export function AdminFinanceConversionsView() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const sp = useSearchParams();
  const filters = useMemo(() => {
    const parsed = parseFinanceFilters(new URLSearchParams(sp.toString()));
    return { ...parsed, type: parsed.type || "CONVERT_FROM_STORE_POINTS", wallet: "CASH" as const };
  }, [sp]);
  /** 조건 = AdminFilterBar + useAdminListQuery (기간·매장 ID·쪽/크기가 주소에 남는다). API 가 from/to/storeId/limit/offset 지원. */
  const lq = useAdminListQuery<(typeof CONVERSION_EXTRAS)[number]>({ extras: CONVERSION_EXTRAS });
  const [storeDraft, setStoreDraft] = useState({ key: lq.query.extras.storeId, value: lq.query.extras.storeId });
  let storeIdInput = storeDraft.value;
  if (storeDraft.key !== lq.query.extras.storeId) {
    storeIdInput = lq.query.extras.storeId;
    setStoreDraft({ key: lq.query.extras.storeId, value: storeIdInput });
  }
  const [rows, setRows] = useState<FinanceUnifiedTx[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);
  /** C-1 — 기간 전체 전환 합계 (쪽과 무관) */
  const [sums, setSums] = useState<UnifiedTxKindSum[] | null>(null);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    setErrorStatus(undefined);
    setSums(null);
    try {
      const qs = new URLSearchParams({
        wallet: "CASH",
        type: "CONVERT_FROM_STORE_POINTS",
        limit: String(lq.query.size),
        offset: String((lq.query.page - 1) * lq.query.size),
      });
      if (filters.storeId) qs.set("storeId", filters.storeId);
      if (filters.from) qs.set("from", filters.from);
      if (filters.to) qs.set("to", filters.to);
      const res = await fetch(`/api/admin/finance/transactions?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        transactions?: FinanceUnifiedTx[];
        total?: number;
        sumsByKind?: unknown;
        error?: string;
      };
      if (seq !== seqRef.current) return;
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setErrorStatus(res.status);
        setRows([]);
        setTotal(0);
        return;
      }
      const list = json.transactions ?? [];
      setRows(list);
      setTotal(typeof json.total === "number" ? json.total : list.length);
      setSums(readUnifiedTxSums(json.sumsByKind));
    } catch {
      if (seq !== seqRef.current) return;
      setError("network_error");
      setRows([]);
      setTotal(0);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [filters.storeId, filters.from, filters.to, lq.query.page, lq.query.size]);

  useEffect(() => {
    void load();
  }, [load, lq.refreshKey]);

  return (
    <div className="space-y-4" data-admin-finance-conversions="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold">{t("admin_finance_conversion_coin_cash")}</h2>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_finance_conversion_withdrawal_rate_is_ledger_meta")}
      </p>
      <AdminFilterBar
        ko={ko}
        requireCompletePeriod
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={() =>
          lq.patch({ from: lq.draft.from, to: lq.draft.to, extras: { storeId: storeIdInput.trim() } })
        }
        onReset={lq.reset}
        pending={loading}
        showSearch={false}
      >
        <label className={FILTER_LABEL}>
          {t("finance_store_id")}
          <input
            className={FILTER_FIELD}
            value={storeIdInput}
            onChange={(e) => setStoreDraft({ key: lq.query.extras.storeId, value: e.target.value })}
            name="storeId"
          />
        </label>
      </AdminFilterBar>
      {!loading && !error && sums ? (
        <AdminFinancePeriodSums
          ko={ko}
          range={adminFinanceRangeText({ from: filters.from, to: filters.to }, ko)}
          basis={t("admin_finance_by_conversion_time_store_filter_applied")}
          cells={conversionSumCells(sums, ko)}
        />
      ) : null}
      {loading ? (
        <AdminLoadingState ko={ko} />
      ) : error ? (
        <AdminErrorState ko={ko} code={error} httpStatus={errorStatus} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_finance_no_conversions")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
      <>
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[64rem] text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
            <tr>
              <th className="px-3 py-2">{t("finance_when_pht")}</th>
              <th className="px-3 py-2">{t("admin_biz_ops_th_store")}</th>
              <th className="px-3 py-2">{t("admin_finance_coin_out")}</th>
              <th className="px-3 py-2">{t("admin_finance_applied_rate")}</th>
              <th className="px-3 py-2">{t("admin_finance_cash_gross")}</th>
              <th className="px-3 py-2">{t("admin_finance_outstanding_applied")}</th>
              <th className="px-3 py-2">{t("admin_finance_cash_net")}</th>
              <th className="px-3 py-2">{t("admin_finance_reference")}</th>
              <th className="px-3 py-2">{t("admin_biz_label_status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sam-border-soft">
            {rows.map((r) => {
              const href = financeTransactionDetailHref(r.txKey, filters);
              const coinOut = metaNum(r.meta, "sp_debited", "points", "coin_out");
              const rate = metaNum(r.meta, "rate_pesos_per_point", "ratePesosPerPoint");
              const rateVer = metaNum(r.meta, "rate_version", "rateVersion");
              const cashGrossMinor = r.amountMinor;
              // Not stored on CONVERT_FROM_STORE_POINTS meta (settlement is side-effect).
              const outstandingApplied: number | null = null;
              const cashNet: number | null = null;
              return (
                <tr
                  key={r.txKey}
                  className="cursor-pointer hover:bg-sam-app"
                  onClick={() => router.push(href)}
                  data-finance-conversion-row={r.txKey}
                >
                  <td className="px-3 py-2 sam-text-xxs whitespace-nowrap">
                    {formatAdminManilaDateTime(r.occurredAt)}
                  </td>
                  <td className="px-3 py-2">
                    {r.storeId ? (
                      <Link
                        href={financeStoreHref(r.storeId, filters)}
                        className="font-semibold text-signature hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.storeName || `${r.storeId.slice(0, 8)}…`}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {coinOut != null
                      ? formatFinanceAmount({ wallet: "COIN", amount: coinOut })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {rate != null ? (
                      <>
                        1:{rate}
                        {rateVer != null ? (
                          <span className="ml-1 sam-text-xxs text-sam-muted">v{rateVer}</span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatFinanceAmount({
                      wallet: "CASH",
                      amount: cashGrossMinor,
                      isMinor: true,
                    })}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-sam-muted">
                    {outstandingApplied == null ? "—" : formatFinanceAmount({ wallet: "CASH", amount: outstandingApplied, isMinor: true })}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-sam-muted">
                    {cashNet == null ? "—" : formatFinanceAmount({ wallet: "CASH", amount: cashNet, isMinor: true })}
                  </td>
                  <td className="px-3 py-2 sam-text-xxs">{financeRelatedTargetLabel(r, ko)}</td>
                  <td className="px-3 py-2">{r.status || t("admin_finance_posted")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AdminPagination
        ko={ko}
        page={lq.query.page}
        size={lq.query.size}
        total={total}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        disabled={loading}
      />
      </>
      )}
    </div>
  );
}
