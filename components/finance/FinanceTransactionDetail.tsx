"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { financeTxBalanceBefore } from "@/lib/finance/finance-tx-balance-before";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
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
  const { t } = useI18n();
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
          <h2 className="text-[16px] font-semibold text-sam-fg">{financeTypeLabel(tx.entryKind, ko)}</h2>
          <p className="sam-text-helper text-sam-muted font-mono">{tx.txKey}</p>
        </div>
        <Link href={backHref} className="text-sm font-semibold text-signature hover:underline" data-finance-back="1">
          {t("common_to_list")}
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 sam-text-body-secondary sm:grid-cols-3">
        <div>
          <dt className="text-sam-muted">{t("finance_when_pht")}</dt>
          <dd>{formatAdminManilaDateTime(tx.occurredAt)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("finance_wallet")}</dt>
          <dd>{financeWalletLabel(tx.wallet, ko)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("finance_direction")}</dt>
          <dd>{credit ? t("finance_credit") : t("finance_debit")}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("finance_amount")}</dt>
          <dd className="font-semibold tabular-nums">
            {formatFinanceAmount({
              wallet: tx.wallet,
              amount: tx.wallet === "CASH" ? tx.amountMinor : tx.amount,
              isMinor: tx.wallet === "CASH",
            })}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("finance_balance_after")}</dt>
          <dd className="tabular-nums">
            {tx.wallet === "CASH"
              ? formatFinanceAmount({ wallet: "CASH", amount: tx.balanceAfterMinor, isMinor: true })
              : tx.balanceAfter != null
                ? formatFinanceAmount({ wallet: tx.wallet, amount: tx.balanceAfter })
                : "—"}
          </dd>
        </div>
        <div>
          {/* Owner 권장안 (2026-11-04) — 예전 매장 패널(연결 0 · 삭제)에 있던 「이전 잔액」「처리 주체」를 거래 상세로 */}
          <dt className="text-sam-muted">{t("finance_balance_before")}</dt>
          <dd className="tabular-nums" data-finance-tx-balance-before="1">
            {(() => {
              const before = financeTxBalanceBefore(tx);
              if (before == null) return "—";
              return tx.wallet === "CASH"
                ? formatFinanceAmount({ wallet: "CASH", amount: before, isMinor: true })
                : formatFinanceAmount({ wallet: tx.wallet, amount: before });
            })()}
          </dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("finance_actor")}</dt>
          <dd data-finance-tx-actor="1">
            {tx.ownerId ? (
              <AdminTechId id={tx.ownerId} />
            ) : tx.wallet === "POINT" ? (
              "—"
            ) : (
              t("finance_system_automatic")
            )}
          </dd>
        </div>
        {tx.status ? (
          <div>
            <dt className="text-sam-muted">{t("finance_status")}</dt>
            <dd>{financeStatusLabel(tx.status, ko)}</dd>
          </div>
        ) : null}
        {tx.entryKind === "CONVERT_FROM_STORE_POINTS" || tx.entryKind === "CONVERT_TO_BUSINESS_CASH" ? (
          <>
            <div>
              <dt className="text-sam-muted">{t("finance_applied_rate_snapshot")}</dt>
              <dd>
                {tx.meta.rate_pesos_per_point != null
                  ? `1:${Number(tx.meta.rate_pesos_per_point)}${
                      tx.meta.rate_version != null ? ` · v${tx.meta.rate_version}` : ""
                    }`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sam-muted">{t("finance_coin_out_meta")}</dt>
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
            {t("finance_order_detail_cta")}
          </Link>
        ) : null}
        {tx.storeId ? (
          <Link
            href={financeStoreHref(tx.storeId, filters)}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold text-signature"
            data-finance-cta="store-finance"
          >
            {t("finance_store_finance_cta")}
          </Link>
        ) : null}
        {adHref ? (
          <Link
            href={adHref}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold text-signature"
            data-finance-cta="ad-detail"
          >
            {t("finance_ad_detail_cta")}
          </Link>
        ) : adLinkId ? (
          <Link
            href={financeAdsHref({ ...filters, adId: adLinkId })}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold text-signature"
            data-finance-cta="ad-funding"
          >
            {t("finance_ad_funding_list_cta")}
          </Link>
        ) : null}
        {tx.memberId ? (
          <Link
            href={`/admin/users/${encodeURIComponent(tx.memberId)}`}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm font-semibold text-signature"
            data-finance-cta="member-detail"
          >
            {t("finance_member_detail_cta")}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
