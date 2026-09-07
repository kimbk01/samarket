"use client";

import { useRouter } from "next/navigation";
import type { FinanceUnifiedTx } from "@/lib/finance/unified-transaction/types";
import {
  formatFinanceAmount,
  financeTypeLabel,
  financeWalletLabel,
  financeRelatedTargetLabel,
} from "@/lib/finance/presentation";
import {
  financeTransactionDetailHref,
  financeOrderHref,
  financeAdsHref,
  type FinanceFilterState,
} from "@/lib/finance/routes";
import {
  adminAdDetailHref,
  resolveAdFamilyFromCashRelated,
  resolveAdFamilyFromPointSource,
} from "@/lib/finance/deep-links";

export function FinanceTransactionList({
  ko,
  rows,
  filters,
  loading,
  error,
  onRetry,
  emptyFiltered,
}: {
  ko: boolean;
  rows: FinanceUnifiedTx[];
  filters?: FinanceFilterState | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyFiltered?: boolean;
}) {
  const router = useRouter();

  if (loading) {
    return (
      <p className="sam-text-body text-sam-muted" data-finance-tx-list="loading">
        {ko ? "불러오는 중…" : "Loading…"}
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-3" data-finance-tx-list="error">
        <p className="text-amber-950">
          {ko ? "재무 내역을 불러오지 못했습니다." : "Could not load finance transactions."}
        </p>
        {onRetry ? (
          <button
            type="button"
            className="mt-2 rounded-ui-rect border border-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900"
            onClick={onRetry}
          >
            {ko ? "다시 시도" : "Retry"}
          </button>
        ) : null}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-ui-rect border border-dashed border-sam-border px-3 py-8 text-center text-sam-muted"
        data-finance-tx-list="empty"
      >
        <p>
          {emptyFiltered
            ? ko
              ? "선택한 조건의 거래가 없습니다."
              : "No transactions match these filters."
            : ko
              ? "거래가 없습니다."
              : "No transactions."}
        </p>
        {emptyFiltered ? (
          <button
            type="button"
            className="mt-3 rounded-ui-rect border border-sam-border px-3 py-1.5 text-sm font-semibold text-signature"
            onClick={() => router.push("/admin/finance/transactions")}
            data-finance-filter-reset="1"
          >
            {ko ? "필터 초기화" : "Reset filters"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div
        className="hidden overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface md:block"
        data-finance-tx-list="desktop"
      >
        <table className="w-full min-w-[64rem] text-left sam-text-body-secondary">
          <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
            <tr>
              <th className="px-3 py-2">{ko ? "일시" : "When"}</th>
              <th className="px-3 py-2">{ko ? "구분" : "Type"}</th>
              <th className="px-3 py-2">{ko ? "매장/회원" : "Store/Member"}</th>
              <th className="px-3 py-2">{ko ? "연결 대상" : "Linked to"}</th>
              <th className="px-3 py-2">{ko ? "유입" : "In"}</th>
              <th className="px-3 py-2">{ko ? "유출" : "Out"}</th>
              <th className="px-3 py-2">{ko ? "자산" : "Wallet"}</th>
              <th className="px-3 py-2">{ko ? "잔액" : "Balance"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sam-border-soft">
            {rows.map((r) => {
              const href = financeTransactionDetailHref(r.txKey, filters);
              const credit = r.direction === "credit";
              return (
                <tr
                  key={r.txKey}
                  className="cursor-pointer hover:bg-sam-app"
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(href)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(href);
                    }
                  }}
                  data-finance-tx-row={r.txKey}
                >
                  <td className="whitespace-nowrap px-3 py-2 sam-text-xxs">
                    {r.occurredAt ? new Date(r.occurredAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-sam-fg">{financeTypeLabel(r.entryKind, ko)}</span>
                    <span className="mt-0.5 block font-mono sam-text-xxs text-sam-muted">{r.entryKind}</span>
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2">
                    {r.storeName || r.memberLabel || r.memberId?.slice(0, 8) || "—"}
                  </td>
                  <td className="max-w-[12rem] truncate px-3 py-2 sam-text-xxs">
                    {r.orderId ? (
                      <a
                        href={financeOrderHref(r.orderId, filters)}
                        className="font-semibold text-signature hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {financeRelatedTargetLabel(r, ko)}
                      </a>
                    ) : r.adId ? (
                      (() => {
                        const family =
                          resolveAdFamilyFromCashRelated(
                            r.relatedType ?? "",
                            String(r.meta.product_kind ?? "")
                          ) || resolveAdFamilyFromPointSource(r.relatedType ?? "");
                        const href = family
                          ? adminAdDetailHref({ family, id: r.adId })
                          : financeAdsHref({ ...filters, adId: r.adId });
                        return (
                          <a
                            href={href || financeAdsHref({ ...filters, adId: r.adId })}
                            className="font-semibold text-signature hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {financeRelatedTargetLabel(r, ko)}
                          </a>
                        );
                      })()
                    ) : (
                      financeRelatedTargetLabel(r, ko)
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-emerald-700">
                    {credit
                      ? formatFinanceAmount({
                          wallet: r.wallet,
                          amount: r.wallet === "CASH" ? r.amountMinor : r.amount,
                          isMinor: r.wallet === "CASH",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-red-700">
                    {!credit
                      ? formatFinanceAmount({
                          wallet: r.wallet,
                          amount: r.wallet === "CASH" ? r.amountMinor : r.amount,
                          isMinor: r.wallet === "CASH",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{financeWalletLabel(r.wallet, ko)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.wallet === "CASH"
                      ? formatFinanceAmount({
                          wallet: "CASH",
                          amount: r.balanceAfterMinor,
                          isMinor: true,
                        })
                      : r.balanceAfter != null
                        ? formatFinanceAmount({ wallet: r.wallet, amount: r.balanceAfter })
                        : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden" data-finance-tx-list="mobile">
        {rows.map((r) => {
          const href = financeTransactionDetailHref(r.txKey, filters);
          const credit = r.direction === "credit";
          return (
            <li key={r.txKey}>
              <button
                type="button"
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                onClick={() => router.push(href)}
                data-finance-tx-row={r.txKey}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sam-fg">{financeTypeLabel(r.entryKind, ko)}</p>
                    <p className="sam-text-xxs text-sam-muted">
                      {financeWalletLabel(r.wallet, ko)} ·{" "}
                      {r.storeName || r.memberLabel || r.memberId?.slice(0, 8) || "—"}
                    </p>
                    <p className="sam-text-xxs text-sam-muted">{financeRelatedTargetLabel(r, ko)}</p>
                    <p className="sam-text-xxs text-sam-muted">
                      {r.occurredAt ? new Date(r.occurredAt).toLocaleString() : "—"}
                    </p>
                  </div>
                  <p className={`font-semibold tabular-nums ${credit ? "text-emerald-700" : "text-red-700"}`}>
                    {credit ? "+" : "−"}
                    {formatFinanceAmount({
                      wallet: r.wallet,
                      amount: r.wallet === "CASH" ? r.amountMinor : r.amount,
                      isMinor: r.wallet === "CASH",
                    })}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
