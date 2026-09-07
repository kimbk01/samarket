"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { FinanceSummaryStrip, type FinanceSummaryStripModel } from "@/components/finance/FinanceSummaryStrip";
import { AdminFinanceControlPlane } from "@/components/admin/finance/AdminFinanceControlPlane";
import {
  financeOrdersHref,
  financeOutstandingHref,
  financeSettingsHref,
  financeTransactionListHref,
  financeWithdrawalsHref,
} from "@/lib/finance/routes";

export function AdminFinanceHubView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [summary, setSummary] = useState<FinanceSummaryStripModel | null>(null);

  const load = useCallback(async () => {
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
        // Preserve 0 — do not coerce via || null
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

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-hub="1">
      <FinanceAdminNav ko={ko} />
      <FinanceSummaryStrip ko={ko} model={summary} />

      <div className="flex flex-wrap gap-2">
        <Link
          href={financeTransactionListHref()}
          className="rounded-ui-rect bg-signature px-3 py-2 text-sm font-semibold text-white"
          data-finance-cta="open-transactions"
        >
          {ko ? "전체 거래 열기" : "Open all transactions"}
        </Link>
        <Link
          href={financeOutstandingHref()}
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold"
          data-finance-cta="open-outstanding"
        >
          {ko ? "미납 내역 보기" : "Outstanding fees"}
        </Link>
        <Link
          href={financeOrdersHref()}
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold"
          data-finance-cta="open-orders"
        >
          {ko ? "주문별 정산" : "Order settlements"}
        </Link>
        <Link
          href={financeWithdrawalsHref()}
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold"
          data-finance-cta="open-withdrawals"
        >
          {ko ? "출금 대기" : "Withdrawals"}
        </Link>
        <Link
          href={financeSettingsHref()}
          className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold"
          data-finance-cta="open-settings"
        >
          {ko ? "전환 정책 설정" : "Conversion settings"}
        </Link>
      </div>

      {/* Action required — keep Control Plane list, not balance card dashboard */}
      <AdminFinanceControlPlane />
    </div>
  );
}
