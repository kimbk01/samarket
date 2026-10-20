"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FinanceAdminNav } from "@/components/finance/FinanceAdminNav";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { financeTypeFilterOptions } from "@/lib/finance/presentation";
import { FinanceTransactionList } from "@/components/finance/FinanceTransactionList";
import type { FinanceUnifiedTx } from "@/lib/finance/unified-transaction/types";
import { parseFinanceFilters } from "@/lib/finance/routes";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";

/**
 * 필터 키 — 예전 `FinanceFilterBar` 주소 키 그대로 (대시보드·다른 화면 딥링크 `?wallet=`·`?date=today`·`?direction=` 호환).
 * from/to 는 공통 기간 키와 같은 이름.
 */
const FINANCE_TX_EXTRAS = ["wallet", "type", "storeId", "orderId", "direction", "date", "adId", "memberId"] as const;
type FinanceTxExtra = (typeof FINANCE_TX_EXTRAS)[number];

const FIELD =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]";

/**
 * 통합 거래 내역 (R7) — 조건은 `AdminFilterBar` + `useAdminListQuery` 로 주소에 남는다.
 * 목록 페이지(9)는 현금·코인·포인트 세 원장을 메모리에서 합치는 구조라 DB 한 번에 페이지를 걸 수 없다 —
 * 통합 뷰/RPC 신설(운영 DB 승인 사항) 전까지 기존 100건 조회를 그대로 둔다.
 */
export function AdminFinanceTransactionsView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const sp = useSearchParams();
  const filters = useMemo(() => parseFinanceFilters(new URLSearchParams(sp.toString())), [sp]);
  const lq = useAdminListQuery<FinanceTxExtra>({ extras: FINANCE_TX_EXTRAS });
  const typeOptions = useMemo(() => financeTypeFilterOptions(ko), [ko]);
  /** 텍스트형 추가 조건(매장·주문 ID) — 「조회」/Enter 때 적용. 주소가 바뀌면 다시 맞춘다. */
  const appliedIds = `${lq.query.extras.storeId}\u0000${lq.query.extras.orderId}`;
  const [idDraft, setIdDraft] = useState({ key: appliedIds, storeId: lq.query.extras.storeId, orderId: lq.query.extras.orderId });
  let ids = idDraft;
  if (idDraft.key !== appliedIds) {
    ids = { key: appliedIds, storeId: lq.query.extras.storeId, orderId: lq.query.extras.orderId };
    setIdDraft(ids);
  }
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
      const json = (await res.json().catch(() => ({}))) as {
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
      setError("network_error");
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
      {filters.wallet === "POINT" ? (
        <div
          className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          data-finance-point-actions="1"
        >
          <AdminActionLink
            href="/admin/points/ledger"
            variant="secondary"
            data-finance-cta="point-credit-panel"
          >
            {ko ? "Point 지급 / 회수" : "Credit / reclaim Point"}
          </AdminActionLink>
          <p className="sam-text-helper self-center text-sam-muted">
            {ko
              ? "조정은 기존 Point ledger confirm 계약을 사용합니다."
              : "Adjustments use the existing Point ledger confirm contract."}
          </p>
        </div>
      ) : null}
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={() =>
          lq.patch({
            from: lq.draft.from,
            to: lq.draft.to,
            extras: { storeId: ids.storeId.trim(), orderId: ids.orderId.trim() },
          })
        }
        onReset={lq.reset}
        pending={loading}
        showSearch={false}
      >
        <label className={LABEL}>
          {ko ? "자산" : "Wallet"}
          <select
            className={FIELD}
            value={lq.query.extras.wallet}
            onChange={(e) => lq.setExtra("wallet", e.target.value)}
            data-finance-filter-wallet="1"
          >
            <option value="">{ko ? "전체" : "All"}</option>
            <option value="POINT">Point</option>
            <option value="COIN">Coin</option>
            <option value="CASH">Cash</option>
          </select>
        </label>
        <label className={LABEL}>
          {ko ? "유형" : "Type"}
          <select
            className={`${FIELD} max-w-[14rem]`}
            value={lq.query.extras.type}
            onChange={(e) => lq.setExtra("type", e.target.value)}
          >
            <option value="">{ko ? "전체" : "All"}</option>
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          {ko ? "매장 ID" : "Store ID"}
          <input
            className={`${FIELD} min-w-[10rem]`}
            value={ids.storeId}
            onChange={(e) => setIdDraft({ ...ids, storeId: e.target.value })}
            name="storeId"
          />
        </label>
        <label className={LABEL}>
          {ko ? "주문 ID" : "Order ID"}
          <input
            className={`${FIELD} min-w-[10rem]`}
            value={ids.orderId}
            onChange={(e) => setIdDraft({ ...ids, orderId: e.target.value })}
            name="orderId"
          />
        </label>
      </AdminFilterBar>
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
