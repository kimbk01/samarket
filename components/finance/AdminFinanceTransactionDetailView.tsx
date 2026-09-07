"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { FinanceTransactionDetail } from "@/components/finance/FinanceTransactionDetail";
import type { FinanceUnifiedTx } from "@/lib/finance/unified-transaction/types";
import { parseFinanceFilters } from "@/lib/finance/routes";

export function AdminFinanceTransactionDetailView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const params = useParams();
  const sp = useSearchParams();
  const txKey = decodeURIComponent(String(params?.txKey ?? "").trim());
  const filters = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  const [tx, setTx] = useState<FinanceUnifiedTx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!txKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/finance/transactions?txKey=${encodeURIComponent(txKey)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        transaction?: FinanceUnifiedTx;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.transaction) {
        setError(json.error || "not_found");
        setTx(null);
        return;
      }
      setTx(json.transaction);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [txKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-tx-detail-page="1">
      <FinanceAdminNav ko={ko} />
      {loading ? <p className="text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p> : null}
      {error ? (
        <p className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
          {ko ? "거래를 불러오지 못했습니다." : "Could not load transaction."}
        </p>
      ) : null}
      {tx ? <FinanceTransactionDetail ko={ko} tx={tx} filters={filters} /> : null}
    </div>
  );
}
