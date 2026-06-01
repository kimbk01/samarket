"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { OwnerPointDepositStep } from "@/lib/stores/owner-point-deposit-context";

export function OwnerStorePointWarningCard({
  storeId,
  pointBalance,
  pointCommerceBlocked,
  estimatedAcceptCount,
  depositStep,
  pendingCharge,
}: {
  storeId: string;
  pointBalance: number;
  pointCommerceBlocked: boolean;
  estimatedAcceptCount?: number;
  depositStep?: OwnerPointDepositStep;
  pendingCharge?: { pointAmount: number } | null;
}) {
  const { t } = useI18n();
  const balance = Math.max(0, Math.floor(pointBalance));
  const blocked = pointCommerceBlocked;
  const est = estimatedAcceptCount ?? Math.floor(balance / 10);

  const stepHint =
    depositStep === "awaiting_answer"
      ? t("store_owner_point_dashboard_awaiting_account")
      : depositStep === "charge_pending" && pendingCharge
        ? t("store_owner_point_dashboard_charge_pending")
        : null;

  return (
    <section
      className={`rounded-ui-rect border p-4 shadow-sm ${
        blocked
          ? "border-amber-400 bg-amber-50/90"
          : balance <= 100
            ? "border-[#006241]/30 bg-[#006241]/5"
            : "border-sam-border bg-sam-surface"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-sam-muted">{t("store_owner_point_title")}</p>
          <p className="mt-1 text-2xl font-bold text-[#006241]">
            {balance.toLocaleString()}P
          </p>
          <p className="mt-0.5 text-xs text-sam-muted">{t("store_owner_point_balance_label")}</p>
        </div>
        {blocked ? (
          <span className="rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">
            {t("store_owner_point_blocked_badge")}
          </span>
        ) : null}
      </div>

      {blocked ? (
        <p className="mt-3 text-sm text-amber-900">{t("store_owner_point_blocked_message")}</p>
      ) : (
        <p className="mt-2 text-sm text-sam-muted">
          {t("store_owner_point_estimated_orders")}:{" "}
          {t("store_owner_point_estimated_orders_unit", { count: String(Math.max(0, est)) })}
        </p>
      )}

      {stepHint ? <p className="mt-2 text-sm text-sam-fg">{stepHint}</p> : null}

      <div className="mt-3">
        <Link
          href={OwnerRoutes.points(storeId)}
          className="inline-flex rounded-ui-rect bg-[#006241] px-3 py-2 text-sm font-semibold text-white"
        >
          {t("store_owner_point_charge_cta")}
        </Link>
      </div>
    </section>
  );
}
