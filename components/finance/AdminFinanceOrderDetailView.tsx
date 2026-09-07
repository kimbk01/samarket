"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { OrderMoneyChainView } from "@/components/finance/OrderMoneyChainView";
import type { OrderMoneyChain } from "@/lib/finance/order-money-chain/types";
import { parseFinanceFilters } from "@/lib/finance/routes";

export function AdminFinanceOrderDetailView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const params = useParams();
  const sp = useSearchParams();
  const orderId = decodeURIComponent(String(params?.orderId ?? "").trim());
  const filters = parseFinanceFilters(new URLSearchParams(sp.toString()));
  const [chain, setChain] = useState<OrderMoneyChain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/finance/order-money-chain?orderId=${encodeURIComponent(orderId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json()) as { ok?: boolean; chain?: OrderMoneyChain; error?: string };
      if (!res.ok || !json.ok || !json.chain) {
        setError(json.error || "not_found");
        setChain(null);
        return;
      }
      setChain(json.chain);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-admin-finance-order="1">
      <FinanceAdminNav ko={ko} />
      {loading ? <p className="text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p> : null}
      {error ? (
        <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2">
          <p>{ko ? "주문 정산을 불러오지 못했습니다." : "Could not load order finance."}</p>
          <button type="button" className="mt-2 font-semibold text-signature" onClick={() => void load()}>
            {ko ? "다시 시도" : "Retry"}
          </button>
        </div>
      ) : null}
      {chain ? <OrderMoneyChainView ko={ko} chain={chain} filters={filters} /> : null}
    </div>
  );
}
