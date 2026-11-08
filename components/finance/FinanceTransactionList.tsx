"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
} from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
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
  const { t } = useI18n();

  if (loading) {
    return (
      <div data-finance-tx-list="loading">
        <AdminLoadingState ko={ko} />
      </div>
    );
  }

  if (error) {
    return (
      <div data-finance-tx-list="error">
        <AdminErrorState ko={ko} code={error} onRetry={onRetry} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div data-finance-tx-list="empty">
        <AdminEmptyState
          ko={ko}
          message={
            emptyFiltered
              ? undefined
              : t("finance_no_transactions")
          }
          onReset={emptyFiltered ? () => router.push("/admin/finance/transactions") : undefined}
        />
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
              <th className="px-3 py-2">{t("finance_when_pht")}</th>
              <th className="px-3 py-2">{t("finance_type_col")}</th>
              <th className="px-3 py-2">{t("finance_store_member")}</th>
              <th className="px-3 py-2">{t("finance_linked_to")}</th>
              <th className="px-3 py-2 text-right">{t("finance_in")}</th>
              <th className="px-3 py-2 text-right">{t("finance_out")}</th>
              <th className="px-3 py-2">{t("finance_wallet")}</th>
              <th className="px-3 py-2 text-right">{t("finance_balance")}</th>
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
                    {r.occurredAt ? formatAdminManilaDateTime(r.occurredAt) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-sam-fg" data-finance-entry-kind={r.entryKind}>
                      {financeTypeLabel(r.entryKind, ko)}
                    </span>
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
                  <td className="px-3 py-2 text-right tabular-nums text-sam-success">
                    {credit
                      ? formatFinanceAmount({
                          wallet: r.wallet,
                          amount: r.wallet === "CASH" ? r.amountMinor : r.amount,
                          isMinor: r.wallet === "CASH",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-sam-danger">
                    {!credit
                      ? formatFinanceAmount({
                          wallet: r.wallet,
                          amount: r.wallet === "CASH" ? r.amountMinor : r.amount,
                          isMinor: r.wallet === "CASH",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{financeWalletLabel(r.wallet, ko)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
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
              <Link
                href={href}
                prefetch={false}
                className="block w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
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
                      {r.occurredAt ? formatAdminManilaDateTime(r.occurredAt) : "—"}
                    </p>
                  </div>
                  <p className={`font-semibold tabular-nums ${credit ? "text-sam-success" : "text-sam-danger"}`}>
                    {credit ? "+" : "−"}
                    {formatFinanceAmount({
                      wallet: r.wallet,
                      amount: r.wallet === "CASH" ? r.amountMinor : r.amount,
                      isMinor: r.wallet === "CASH",
                    })}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
