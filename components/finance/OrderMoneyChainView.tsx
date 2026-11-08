"use client";

import NextLink from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OrderMoneyChain, OrderMoneyChainEvent } from "@/lib/finance/order-money-chain/types";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import { financeTransactionDetailHref, type FinanceFilterState } from "@/lib/finance/routes";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * R7-a — 타임라인 줄 금액. Cash(수수료 차감·미납) = 센타보 → 소수점 2자리(정수 반올림 금지).
 * Coin = 정수. 판매·정산(SETTLEMENT) 줄은 주문 금액(페소) 표시를 유지한다.
 */
export function formatOrderMoneyChainEventAmount(ev: Pick<OrderMoneyChainEvent, "wallet" | "amount" | "amountMinor">): string {
  if (ev.wallet === "CASH") {
    if (ev.amountMinor != null) return formatFinanceAmount({ wallet: "CASH", amount: ev.amountMinor, isMinor: true });
    if (ev.amount != null) return formatFinanceAmount({ wallet: "CASH", amount: ev.amount });
    return "—";
  }
  if (ev.amount == null) return "—";
  if (ev.wallet === "COIN") return formatFinanceAmount({ wallet: "COIN", amount: ev.amount });
  return formatMoneyPhp(ev.amount);
}

export function OrderMoneyChainView({
  chain,
  filters,
}: {
  ko: boolean;
  chain: OrderMoneyChain;
  filters?: FinanceFilterState | null;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4" data-order-money-chain="1">
      <header>
        <h2 className="text-[16px] font-semibold text-sam-fg">
          {chain.storeName} · #{chain.orderNo || chain.orderId.slice(0, 8)}
        </h2>
        {/* 주문 완료 시각 — UTC 원문 대신 PHT (실기 A-9 FAIL · 2026-11-03) */}
        <p className="sam-text-helper text-sam-muted">
          {chain.date ? t("finance_completed_at", { at: formatAdminManilaDateTime(chain.date) }) : "—"}
        </p>
      </header>

      <section>
        <h3 className="mb-2 font-semibold">{t("finance_items_section")}</h3>
        <table className="w-full text-left sam-text-body-secondary">
          <thead className="text-sam-muted">
            <tr>
              <th className="py-1">{t("finance_item_col")}</th>
              <th className="py-1">Qty</th>
              <th className="py-1">{t("finance_subtotal_col")}</th>
            </tr>
          </thead>
          <tbody>
            {chain.items.map((it) => (
              <tr key={it.id} className="border-t border-sam-border-soft">
                <td className="py-1">{it.title}</td>
                <td className="py-1">{it.qty}</td>
                <td className="py-1 tabular-nums">{formatMoneyPhp(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 sam-text-xxs text-sam-muted">
          {t("finance_items_composition_note")}
        </p>
      </section>

      <dl className="grid grid-cols-2 gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:grid-cols-3">
        <div>
          <dt className="sam-text-xxs text-sam-muted">Gross</dt>
          <dd className="font-semibold">{formatMoneyPhp(chain.financial.gross)}</dd>
        </div>
        <div>
          <dt className="sam-text-xxs text-sam-muted">{t("finance_fee_rate")}</dt>
          <dd className="font-semibold">
            {chain.financial.feeRateSnapshot != null ? `${chain.financial.feeRateSnapshot}%` : "—"}
          </dd>
        </div>
        <div>
          {/* 수수료·Cash 차감·미납 = Cash(센타보) — 소수점 2자리 (정수 반올림 금지 · 실기 O-2 같은 원인 2026-11-03) */}
          <dt className="sam-text-xxs text-sam-muted">{t("finance_fee")}</dt>
          <dd className="font-semibold">{formatFinanceAmount({ wallet: "CASH", amount: chain.financial.feeDueMinor, isMinor: true })}</dd>
        </div>
        <div>
          <dt className="sam-text-xxs text-sam-muted">{t("finance_cash_charged")}</dt>
          <dd className="font-semibold">{formatFinanceAmount({ wallet: "CASH", amount: chain.financial.cashFeePaidMinor, isMinor: true })}</dd>
        </div>
        <div>
          <dt className="sam-text-xxs text-sam-muted">{t("finance_outstanding")}</dt>
          <dd className="font-semibold">{formatFinanceAmount({ wallet: "CASH", amount: chain.financial.outstandingFeeMinor, isMinor: true })}</dd>
        </div>
        <div>
          <dt className="sam-text-xxs text-sam-muted">{t("finance_coin_earned")}</dt>
          <dd className="font-semibold">
            {formatFinanceAmount({ wallet: "COIN", amount: chain.financial.coinEarned })}
          </dd>
        </div>
      </dl>

      <section>
        <h3 className="mb-2 font-semibold">{t("finance_timeline_title")}</h3>
        <ol className="space-y-2">
          {chain.timeline.map((ev) => {
            const txKey = ev.sourceTable.includes("business_cash")
              ? `cash:${ev.sourceId}`
              : ev.sourceTable.includes("economic_point")
                ? `coin:${ev.sourceId}`
                : null;
            const body = (
              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
                <span>
                  <span className="font-medium">{ev.label}</span>
                  {/* R6-c — 원문 UTC ISO 금지 · PHT 「YYYY-MM-DD HH:mm」 */}
                  <span className="ml-2 sam-text-xxs text-sam-muted" data-finance-timeline-at-pht="1">
                    {formatAdminManilaDateTime(ev.at)} PHT
                  </span>
                </span>
                <span className="tabular-nums">
                  {formatOrderMoneyChainEventAmount(ev)}
                </span>
              </div>
            );
            if (txKey) {
              return (
                <li key={ev.id}>
                  <NextLink
                    href={financeTransactionDetailHref(txKey, {
                      ...filters,
                      orderId: chain.orderId,
                      storeId: chain.storeId,
                    })}
                    className="block hover:opacity-90"
                    data-finance-timeline-tx={txKey}
                  >
                    {body}
                  </NextLink>
                </li>
              );
            }
            return <li key={ev.id}>{body}</li>;
          })}
        </ol>
      </section>
    </div>
  );
}
