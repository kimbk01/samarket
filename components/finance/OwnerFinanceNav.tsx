"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { normalizeOwnerFinanceSection, ownerFinanceSectionHref } from "@/lib/finance/routes";

/** label = 언어 공통 이름(Coin·Cash), labelKey = 카탈로그 키 */
const OWNER_FINANCE_NAV: ReadonlyArray<{
  key: string;
  section: "transactions" | "outstanding" | "coin" | "cash" | "ads" | "convert" | "withdraw";
  labelKey?: MessageKey;
  label?: string;
}> = [
  { key: "transactions", section: "transactions", labelKey: "finance_nav_transactions" },
  { key: "outstanding", section: "outstanding", labelKey: "finance_nav_fees_outstanding" },
  { key: "coin", section: "coin", label: "Coin" },
  { key: "cash", section: "cash", label: "Cash" },
  { key: "ads", section: "ads", labelKey: "finance_nav_ad_spend" },
  { key: "convert", section: "convert", labelKey: "finance_nav_top_up_convert" },
  { key: "withdraw", section: "withdraw", labelKey: "finance_coin_withdrawal" },
];

export function OwnerFinanceNav({
  storeId,
}: {
  storeId: string;
  ko: boolean;
}) {
  const sp = useSearchParams();
  const { t } = useI18n();
  const active = normalizeOwnerFinanceSection(sp.get("section"));

  return (
    <nav
      className="flex flex-wrap gap-1.5 border-b border-sam-border pb-2"
      data-owner-finance-nav="1"
      aria-label={t("finance_owner_nav_aria")}
    >
      {OWNER_FINANCE_NAV.map((item) => {
        const href = ownerFinanceSectionHref(storeId, item.section);
        const isActive = active === item.section;
        return (
          <Link
            key={item.key}
            href={href}
            className={`inline-flex min-h-11 items-center rounded-ui-rect px-3 py-2 text-xs font-medium ${
              isActive
                ? "bg-signature/10 text-signature"
                : "border border-sam-border bg-sam-app text-sam-fg"
            }`}
            data-owner-finance-nav-item={item.key}
          >
            {item.labelKey ? t(item.labelKey) : item.label}
          </Link>
        );
      })}
    </nav>
  );
}
