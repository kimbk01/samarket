"use client";

import NextLink from "next/link";
import type { OrderMoneyChain } from "@/lib/finance/order-money-chain/types";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import { financeTransactionDetailHref, type FinanceFilterState } from "@/lib/finance/routes";
import { formatMoneyPhp } from "@/lib/utils/format";

export function OrderMoneyChainView({
  ko,
  chain,
  filters,
}: {
  ko: boolean;
  chain: OrderMoneyChain;
  filters?: FinanceFilterState | null;
}) {
  return (
    <div className="space-y-4" data-order-money-chain="1">
      <header>
        <h2 className="text-lg font-semibold text-sam-fg">
          {chain.storeName} · #{chain.orderNo || chain.orderId.slice(0, 8)}
        </h2>
        <p className="sam-text-helper text-sam-muted">{chain.date}</p>
      </header>

      <section>
        <h3 className="mb-2 font-semibold">{ko ? "상품 구성" : "Items"}</h3>
        <table className="w-full text-left sam-text-body-secondary">
          <thead className="text-sam-muted">
            <tr>
              <th className="py-1">{ko ? "상품" : "Item"}</th>
              <th className="py-1">Qty</th>
              <th className="py-1">{ko ? "금액" : "Subtotal"}</th>
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
          {ko
            ? "품목은 판매 구성만 표시합니다. 수수료·Coin은 주문 단위입니다."
            : "Items show composition only. Fee and Coin are order-level."}
        </p>
      </section>

      <dl className="grid grid-cols-2 gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:grid-cols-3">
        <div>
          <dt className="sam-text-xxs text-sam-muted">Gross</dt>
          <dd className="font-semibold">{formatMoneyPhp(chain.financial.gross)}</dd>
        </div>
        <div>
          <dt className="sam-text-xxs text-sam-muted">{ko ? "수수료율" : "Fee %"}</dt>
          <dd className="font-semibold">
            {chain.financial.feeRateSnapshot != null ? `${chain.financial.feeRateSnapshot}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="sam-text-xxs text-sam-muted">{ko ? "수수료" : "Fee"}</dt>
          <dd className="font-semibold">{formatMoneyPhp(chain.financial.feeDue)}</dd>
        </div>
        <div>
          <dt className="sam-text-xxs text-sam-muted">{ko ? "Cash 실제 차감" : "Cash charged"}</dt>
          <dd className="font-semibold">{formatMoneyPhp(chain.financial.cashFeePaid)}</dd>
        </div>
        <div>
          <dt className="sam-text-xxs text-sam-muted">{ko ? "미납" : "Outstanding"}</dt>
          <dd className="font-semibold">{formatMoneyPhp(chain.financial.outstandingFee)}</dd>
        </div>
        <div>
          <dt className="sam-text-xxs text-sam-muted">{ko ? "Coin 발생" : "Coin earned"}</dt>
          <dd className="font-semibold">
            {formatFinanceAmount({ wallet: "COIN", amount: chain.financial.coinEarned })}
          </dd>
        </div>
      </dl>

      <section>
        <h3 className="mb-2 font-semibold">{ko ? "정산 타임라인" : "Finance timeline"}</h3>
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
                  <span className="ml-2 sam-text-xxs text-sam-muted">{ev.at}</span>
                </span>
                <span className="tabular-nums">
                  {ev.amount != null
                    ? ev.wallet === "COIN"
                      ? formatFinanceAmount({ wallet: "COIN", amount: ev.amount })
                      : formatMoneyPhp(ev.amount)
                    : "—"}
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
