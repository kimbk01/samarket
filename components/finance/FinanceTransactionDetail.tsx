"use client";

import Link from "next/link";
import type { FinanceUnifiedTx } from "@/lib/finance/unified-transaction/types";
import {
  formatFinanceAmount,
  financeTypeLabel,
  financeWalletLabel,
  financeStatusLabel,
} from "@/lib/finance/presentation";
import {
  financeOrderHref,
  financeStoreHref,
  financeAdsHref,
  financeTransactionListHref,
  type FinanceFilterState,
} from "@/lib/finance/routes";
import { adminAdDetailHref, resolveAdFamilyFromCashRelated, resolveAdFamilyFromPointSource } from "@/lib/finance/deep-links";

export function FinanceTransactionDetail({
  ko,
  tx,
  filters,
}: {
  ko: boolean;
  tx: FinanceUnifiedTx;
  filters?: FinanceFilterState | null;
}) {
  const credit = tx.direction === "credit";
  const backHref = financeTransactionListHref(filters);

  const ek = String(tx.entryKind || "").toUpperCase();
  const orderLinkId =
    tx.orderId ||
    (ek.includes("SALE_FEE") || ek.includes("SALE_EARN") || ek.includes("OBLIGATION")
      ? tx.relatedId
      : null);
  const adLinkId =
    tx.adId ||
    (ek.includes("AD_") || ek.includes("PARTNER_")
      ? tx.relatedId ||
        (tx.meta.application_id == null ? null : String(tx.meta.application_id)) ||
        (tx.meta.ad_id == null ? null : String(tx.meta.ad_id))
      : null);
  const adFamily =
    tx.wallet === "POINT"
      ? resolveAdFamilyFromPointSource(tx.relatedType ?? "")
      : resolveAdFamilyFromCashRelated(tx.relatedType ?? "", String(tx.meta.product_kind ?? ""));
  const adHref = adLinkId && adFamily ? adminAdDetailHref({ family: adFamily, id: adLinkId }) : null;

  return (
    <article className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-finance-tx-detail="1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-sam-fg">{financeTypeLabel(tx.entryKind, ko)}</h2>
          <p className="sam-text-helper text-sam-muted font-mono">{tx.txKey}</p>
        </div>
        <Link href={backHref} className="text-sm font-semibold text-signature hover:underline" data-finance-back="1">
          {ko ? "목록으로" : "Back to list"}
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 sam-text-body-secondary sm:grid-cols-3">
        <div>
          <dt className="text-sam-muted">{ko ? "일시" : "When"}</dt>
          <dd>{tx.occurredAt ? new Date(tx.occurredAt).toLocaleString() : "—"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{ko ? "자산" : "Wallet"}</dt>
          <dd>{financeWalletLabel(tx.wallet, ko)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{ko ? "방향" : "Direction"}</dt>
          <dd>{credit ? (ko ? "입금" : "Credit") : ko ? "출금" : "Debit"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{ko ? "금액" : "Amount"}</dt>
          <dd className="font-semibold tabular-nums">
            {formatFinanceAmount({
              wallet: tx.wallet,
              amount: tx.wallet === "CASH" ? tx.amountMinor : tx.amount,
              isMinor: tx.wallet === "CASH",
            })}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{ko ? "이후 잔액" : "Balance after"}</dt>
          <dd className="tabular-nums">
            {tx.wallet === "CASH"
              ? formatFinanceAmount({ wallet: "CASH", amount: tx.balanceAfterMinor, isMinor: true })
              : tx.balanceAfter != null
                ? formatFinanceAmount({ wallet: tx.wallet, amount: tx.balanceAfter })
                : "—"}
          </dd>
        </div>
        {tx.status ? (
          <div>
            <dt className="text-sam-muted">{ko ? "상태" : "Status"}</dt>
            <dd>{financeStatusLabel(tx.status, ko)}</dd>
          </div>
        ) : null}
        {tx.entryKind === "CONVERT_FROM_STORE_POINTS" || tx.entryKind === "CONVERT_TO_BUSINESS_CASH" ? (
          <>
            <div>
              <dt className="text-sam-muted">{ko ? "적용 Rate snapshot" : "Applied rate snapshot"}</dt>
              <dd>
                {tx.meta.rate_pesos_per_point != null
                  ? `1:${Number(tx.meta.rate_pesos_per_point)}${
                      tx.meta.rate_version != null ? ` · v${tx.meta.rate_version}` : ""
                    }`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{ko ? "Coin Out (meta)" : "Coin out (meta)"}</dt>
              <dd>
                {tx.meta.sp_debited != null
                  ? formatFinanceAmount({ wallet: "COIN", amount: Number(tx.meta.sp_debited) })
                  : "—"}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-sam-border pt-3">
        {orderLinkId ? (
          <Link
            href={financeOrderHref(orderLinkId, filters)}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold text-signature"
            data-finance-cta="order-detail"
          >
            {ko ? "주문 상세" : "Order detail"}
          </Link>
        ) : null}
        {tx.storeId ? (
          <Link
            href={financeStoreHref(tx.storeId, filters)}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold text-signature"
            data-finance-cta="store-finance"
          >
            {ko ? "매장 재무 보기" : "Store finance"}
          </Link>
        ) : null}
        {adHref ? (
          <Link
            href={adHref}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold text-signature"
            data-finance-cta="ad-detail"
          >
            {ko ? "광고 상세" : "Ad detail"}
          </Link>
        ) : adLinkId ? (
          <Link
            href={financeAdsHref({ ...filters, adId: adLinkId })}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold text-signature"
            data-finance-cta="ad-funding"
          >
            {ko ? "광고 지출 내역" : "Ad funding list"}
          </Link>
        ) : null}
        {tx.memberId ? (
          <Link
            href={`/admin/users/${encodeURIComponent(tx.memberId)}`}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold text-signature"
            data-finance-cta="member-detail"
          >
            {ko ? "회원 상세" : "Member detail"}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
