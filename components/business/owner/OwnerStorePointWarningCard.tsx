"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { catalogDateLocale } from "@/lib/i18n/catalog-date-locale";
import {
  OWNER_POINT_ACCOUNT_SECTION_ID,
  OWNER_POINT_DEPOSIT_SECTION_ID,
} from "@/lib/stores/owner-point-deposit-section-id";

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function OwnerStorePointWarningCard({
  storeId,
  pointBalance,
  pointCommerceBlocked,
  pendingCharge,
}: {
  storeId: string;
  pointBalance: number;
  pointCommerceBlocked: boolean;
  pendingCharge?: { pointAmount: number } | null;
}) {
  const { t, language } = useI18n();
  const locale = catalogDateLocale(language);
  const pathname = usePathname();
  const pointsHref = OwnerRoutes.points(storeId);
  const onPointsPage =
    pathname === "/stores/owner/points" || pathname?.endsWith("/stores/owner/points");

  const balance = Math.max(0, Math.floor(pointBalance));
  const blocked = pointCommerceBlocked;

  const scrollAccount = () => scrollToSection(OWNER_POINT_ACCOUNT_SECTION_ID);
  const scrollCharge = () => scrollToSection(OWNER_POINT_DEPOSIT_SECTION_ID);

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
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#006241]">
            {balance.toLocaleString(locale)}P
          </p>
          <p className="mt-0.5 text-xs text-sam-muted">{t("store_owner_point_balance_label")}</p>
          <p className="mt-1 text-[11px] leading-snug text-sam-muted" data-owner-credit-vs-cash="1">
            {t("store_owner_point_not_ad_cash")}
          </p>
        </div>
        {blocked ? (
          <span className="rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">
            {t("store_owner_point_blocked_badge")}
          </span>
        ) : null}
      </div>

      {blocked ? (
        <p className="mt-3 text-sm text-amber-900">{t("store_owner_point_blocked_message")}</p>
      ) : null}

      {pendingCharge ? (
        <p className="mt-2 text-sm text-sam-fg">
          {t("store_owner_point_charge_pending")}:{" "}
          <span className="font-semibold tabular-nums text-[#006241]">
            {pendingCharge.pointAmount.toLocaleString(locale)}P
          </span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {onPointsPage ? (
          <>
            <button
              type="button"
              className="inline-flex rounded-ui-rect border border-[#006241] bg-sam-surface px-3 py-2 text-sm font-semibold text-[#006241]"
              onClick={scrollAccount}
            >
              {t("store_owner_point_account_cta")}
            </button>
            <button
              type="button"
              className="inline-flex rounded-ui-rect bg-[#006241] px-3 py-2 text-sm font-semibold text-white"
              onClick={scrollCharge}
            >
              {t("store_owner_point_charge_cta")}
            </button>
          </>
        ) : (
          <Link
            href={`${pointsHref}#${OWNER_POINT_DEPOSIT_SECTION_ID}`}
            className="inline-flex rounded-ui-rect bg-[#006241] px-3 py-2 text-sm font-semibold text-white"
          >
            {t("store_owner_point_charge_cta")}
          </Link>
        )}
      </div>
    </section>
  );
}
