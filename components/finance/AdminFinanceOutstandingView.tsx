"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { financeOrderHref, financeStoreHref, parseFinanceFilters } from "@/lib/finance/routes";
import { financeStatusLabel } from "@/lib/finance/presentation";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminPhpMinor } from "@/lib/admin/ui-standard/admin-format";

type ObligationRow = {
  id: string;
  store_id: string;
  store_name?: string | null;
  order_id: string;
  fee_due_minor: number;
  fee_paid_minor: number;
  fee_outstanding_minor: number;
  status: string;
  created_at: string;
};

/**
 * Fee / outstanding operational list.
 * Columns map to canonical obligation fields only — no invented aggregates.
 */
export function AdminFinanceOutstandingView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const sp = useSearchParams();
  const filters = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  const [rows, setRows] = useState<ObligationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filters.storeId) qs.set("storeId", filters.storeId);
      const res = await fetch(`/api/admin/finance/outstanding?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rows?: ObligationRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setRows([]);
        return;
      }
      setRows(json.rows ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters.storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-outstanding="1">
      <FinanceAdminNav ko={ko} />
      <h2 className="text-[16px] font-semibold text-sam-fg">{ko ? "수수료 / 미납" : "Fees / outstanding"}</h2>
      <p className="sam-text-helper text-sam-muted">
        {ko
          ? "행을 누르면 OrderMoneyChain으로 이동합니다. 매장명은 stores 조인입니다."
          : "Row opens OrderMoneyChain. Store name comes from stores join."}
      </p>
      {loading ? <AdminLoadingState ko={ko} /> : null}
      {error ? <AdminErrorState ko={ko} code={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <AdminEmptyState ko={ko} message={ko ? "미납 수수료가 없습니다." : "No outstanding fees."} />
      ) : null}
      {rows.length > 0 ? (
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[56rem] text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
            <tr>
              <th className="px-3 py-2">{ko ? "발생일" : "Date"}</th>
              <th className="px-3 py-2">{ko ? "매장" : "Store"}</th>
              <th className="px-3 py-2">{ko ? "주문" : "Order"}</th>
              <th className="px-3 py-2 text-right">{ko ? "Fee Due" : "Fee due"}</th>
              <th className="px-3 py-2 text-right">{ko ? "Cash Paid" : "Cash paid"}</th>
              <th className="px-3 py-2 text-right">{ko ? "Outstanding Created" : "Outstanding created"}</th>
              <th className="px-3 py-2 text-right">{ko ? "Outstanding Collected" : "Collected"}</th>
              <th className="px-3 py-2 text-right">{ko ? "Remaining" : "Remaining"}</th>
              <th className="px-3 py-2">{ko ? "상태" : "Status"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sam-border-soft">
            {rows.map((r) => {
              const orderHref = financeOrderHref(r.order_id, { ...filters, storeId: r.store_id });
              const storeHref = financeStoreHref(r.store_id, filters);
              // Canonical mapping: due / paid / remaining. Created ≈ due (initial obligation).
              const due = r.fee_due_minor;
              const paid = r.fee_paid_minor;
              const remaining = r.fee_outstanding_minor;
              return (
                <tr
                  key={r.id}
                  className="cursor-pointer hover:bg-sam-app"
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(orderHref)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(orderHref);
                    }
                  }}
                  data-finance-outstanding-row={r.id}
                >
                  <td className="px-3 py-2 sam-text-xxs whitespace-nowrap">
                    {r.created_at ? formatAdminManilaDateTime(r.created_at) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={storeHref}
                      className="font-semibold text-signature hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="block">{r.store_name || (ko ? "매장" : "Store")}</span>
                      <span className="block font-mono text-[12px] text-sam-muted">
                        {r.store_id.slice(0, 8)}…
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={orderHref}
                      className="font-semibold text-signature hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.order_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAdminPhpMinor(due)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAdminPhpMinor(paid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAdminPhpMinor(due)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAdminPhpMinor(paid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {formatAdminPhpMinor(remaining)}
                  </td>
                  <td className="px-3 py-2">{financeStatusLabel(r.status, ko)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      ) : null}
    </div>
  );
}
