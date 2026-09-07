"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { FinanceFilterBar } from "@/components/finance/FinanceFilterBar";
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
  const { language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const sp = useSearchParams();
  const filters = useMemo(() => {
    const parsed = parseFinanceFilters(new URLSearchParams(sp.toString()));
    return { ...parsed, type: parsed.type || "CONVERT_FROM_STORE_POINTS", wallet: "CASH" as const };
  }, [sp]);
  const [rows, setRows] = useState<FinanceUnifiedTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        wallet: "CASH",
        type: "CONVERT_FROM_STORE_POINTS",
        limit: "80",
      });
      if (filters.storeId) qs.set("storeId", filters.storeId);
      if (filters.from) qs.set("from", filters.from);
      if (filters.to) qs.set("to", filters.to);
      const res = await fetch(`/api/admin/finance/transactions?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        transactions?: FinanceUnifiedTx[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setRows([]);
        return;
      }
      setRows(json.transactions ?? []);
    } catch {
      setError("network");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters.storeId, filters.from, filters.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-conversions="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-lg font-semibold">{ko ? "전환 · Coin → Cash" : "Conversion · Coin → Cash"}</h2>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "전환 ≠ 출금. 적용 Rate는 원장 meta snapshot입니다. Outstanding Applied / Cash Net은 현재 ledger meta에 없으면 — 입니다."
          : "Conversion ≠ withdrawal. Rate is ledger meta snapshot. Outstanding Applied / Cash Net show — when not in meta."}
      </p>
      <FinanceFilterBar ko={ko} basePath="/admin/finance/conversions" />
      {loading ? <p className="text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p> : null}
      {error ? (
        <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2">
          <p>{ko ? "전환 내역을 불러오지 못했습니다." : "Could not load conversions."}</p>
          <button type="button" className="mt-2 font-semibold text-signature" onClick={() => void load()}>
            {ko ? "다시 시도" : "Retry"}
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[64rem] text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
            <tr>
              <th className="px-3 py-2">{ko ? "일시" : "When"}</th>
              <th className="px-3 py-2">{ko ? "매장" : "Store"}</th>
              <th className="px-3 py-2">{ko ? "Coin Out" : "Coin out"}</th>
              <th className="px-3 py-2">{ko ? "적용 Rate" : "Applied rate"}</th>
              <th className="px-3 py-2">{ko ? "Cash Gross" : "Cash gross"}</th>
              <th className="px-3 py-2">{ko ? "Outstanding Applied" : "Outstanding applied"}</th>
              <th className="px-3 py-2">{ko ? "Cash Net" : "Cash net"}</th>
              <th className="px-3 py-2">{ko ? "Reference" : "Reference"}</th>
              <th className="px-3 py-2">{ko ? "상태" : "Status"}</th>
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
                    {r.occurredAt ? new Date(r.occurredAt).toLocaleString() : "—"}
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
                  <td className="px-3 py-2">{r.status || (ko ? "완료" : "Posted")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && !error && rows.length === 0 ? (
        <p className="text-sam-muted">{ko ? "전환 내역이 없습니다." : "No conversions."}</p>
      ) : null}
    </div>
  );
}
