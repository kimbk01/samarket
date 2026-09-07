"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { FinanceFilterBar } from "@/components/finance/FinanceFilterBar";
import { FinanceTransactionList } from "@/components/finance/FinanceTransactionList";
import type { FinanceUnifiedTx } from "@/lib/finance/unified-transaction/types";
import { parseFinanceFilters } from "@/lib/finance/routes";

export function AdminFinanceTransactionsView({ basePath = "/admin/finance/transactions" }: { basePath?: string }) {
  const { language } = useI18n();
  const ko = language !== "en";
  const sp = useSearchParams();
  const filters = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  const [rows, setRows] = useState<FinanceUnifiedTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filters.wallet) qs.set("wallet", filters.wallet);
      if (filters.type) qs.set("type", filters.type);
      if (filters.direction) qs.set("direction", filters.direction);
      if (filters.date) qs.set("date", filters.date);
      if (filters.storeId) qs.set("storeId", filters.storeId);
      if (filters.orderId) qs.set("orderId", filters.orderId);
      if (filters.adId) qs.set("adId", filters.adId);
      if (filters.memberId) qs.set("memberId", filters.memberId);
      if (filters.from) qs.set("from", filters.from);
      if (filters.to) qs.set("to", filters.to);
      qs.set("limit", "100");
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
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const emptyFiltered = Boolean(
    filters.wallet || filters.type || filters.storeId || filters.orderId || filters.from || filters.to
  );

  return (
    <div className="space-y-4" data-admin-finance-transactions="1">
      <FinanceAdminNav ko={ko} />
      <FinanceFilterBar ko={ko} basePath={basePath} />
      <FinanceTransactionList
        ko={ko}
        rows={rows}
        filters={filters}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyFiltered={emptyFiltered}
      />
    </div>
  );
}
