"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { FinanceSummaryStrip, type FinanceSummaryStripModel } from "@/components/finance/FinanceSummaryStrip";
import { FinanceTransactionList } from "@/components/finance/FinanceTransactionList";
import { AdminFinanceControlPlane } from "@/components/admin/finance/AdminFinanceControlPlane";
import type { FinanceUnifiedTx } from "@/lib/finance/unified-transaction/types";
import { financeTransactionListHref } from "@/lib/finance/routes";

/**
 * Finance Control Plane root — summary strip + operational list first.
 * Action-required queue is secondary (not a card dashboard).
 */
export function AdminFinanceHubView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [summary, setSummary] = useState<FinanceSummaryStripModel | null>(null);
  const [rows, setRows] = useState<FinanceUnifiedTx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/finance-control-plane", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        plane?: {
          actionRequired?: unknown[];
          obligations?: { outstandingMinor?: number } | null;
          todaySummary?: {
            cashInMinor?: number | null;
            cashOutMinor?: number | null;
            coinEarned?: number | null;
            unavailable?: boolean;
          };
        };
      };
      if (!res.ok || !json.ok) {
        setSummary({
          todayCashInMinor: null,
          todayCashOutMinor: null,
          todayCoinEarned: null,
          outstandingMinor: 0,
          pendingActions: 0,
        });
        return;
      }
      const plane = json.plane;
      const today = plane?.todaySummary;
      if (today?.unavailable) {
        setSummary({
          todayCashInMinor: null,
          todayCashOutMinor: null,
          todayCoinEarned: null,
          outstandingMinor: Math.trunc(Number(plane?.obligations?.outstandingMinor) || 0),
          pendingActions: Array.isArray(plane?.actionRequired) ? plane.actionRequired.length : 0,
        });
        return;
      }
      setSummary({
        todayCashInMinor:
          today && today.cashInMinor != null ? Math.trunc(Number(today.cashInMinor)) : null,
        todayCashOutMinor:
          today && today.cashOutMinor != null ? Math.trunc(Number(today.cashOutMinor)) : null,
        todayCoinEarned:
          today && today.coinEarned != null ? Math.trunc(Number(today.coinEarned)) : null,
        outstandingMinor: Math.trunc(Number(plane?.obligations?.outstandingMinor) || 0),
        pendingActions: Array.isArray(plane?.actionRequired) ? plane.actionRequired.length : 0,
      });
    } catch {
      setSummary(null);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    setTxLoading(true);
    setTxError(null);
    try {
      const res = await fetch("/api/admin/finance/transactions?limit=40", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        transactions?: FinanceUnifiedTx[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setTxError(json.error || "load_failed");
        setRows([]);
        return;
      }
      setRows(json.transactions ?? []);
    } catch {
      setTxError("network");
      setRows([]);
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadRecent();
  }, [loadSummary, loadRecent]);

  return (
    <div className="space-y-4" data-admin-finance-hub="1">
      <FinanceAdminNav ko={ko} />
      <FinanceSummaryStrip ko={ko} model={summary} />

      <section className="space-y-2" data-admin-finance-hub-ops-list="1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-sam-fg">
            {ko ? "최근 재무 거래" : "Recent finance transactions"}
          </h2>
          <Link
            href={financeTransactionListHref()}
            className="text-sm font-semibold text-signature hover:underline"
            data-finance-cta="open-transactions"
          >
            {ko ? "전체 거래 열기" : "Open all transactions"}
          </Link>
        </div>
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? "매장·유형·금액·원인으로 추적합니다. 행을 누르면 거래 상세로 이동합니다."
            : "Trace by store, type, amount, and cause. Row opens transaction detail."}
        </p>
        <FinanceTransactionList
          ko={ko}
          rows={rows}
          loading={txLoading}
          error={txError}
          onRetry={() => void loadRecent()}
        />
      </section>

      <section className="space-y-2 border-t border-sam-border pt-4" data-admin-finance-hub-actions="1">
        <h2 className="text-base font-semibold text-sam-fg">
          {ko ? "처리 대기" : "Action required"}
        </h2>
        <AdminFinanceControlPlane />
      </section>
    </div>
  );
}
