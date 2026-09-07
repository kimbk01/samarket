"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ownerFinanceSectionHref } from "@/lib/finance/routes";

const OWNER_FINANCE_NAV = [
  { key: "transactions", section: "transactions" as const, labelKo: "거래내역", labelEn: "Transactions" },
  { key: "orders", section: "orders" as const, labelKo: "주문별 정산", labelEn: "Orders" },
  { key: "outstanding", section: "outstanding" as const, labelKo: "수수료/미납", labelEn: "Fees / outstanding" },
  { key: "coin", section: "coin" as const, labelKo: "Coin", labelEn: "Coin" },
  { key: "cash", section: "cash" as const, labelKo: "Cash", labelEn: "Cash" },
  { key: "ads", section: "ads" as const, labelKo: "광고 지출", labelEn: "Ad spend" },
  { key: "convert", section: "convert" as const, labelKo: "전환", labelEn: "Convert" },
  { key: "withdraw", section: "withdraw" as const, labelKo: "출금", labelEn: "Withdraw" },
] as const;

export function OwnerFinanceNav({
  storeId,
  ko,
}: {
  storeId: string;
  ko: boolean;
}) {
  const sp = useSearchParams();
  const active = (sp.get("section") || "transactions").trim();

  return (
    <nav
      className="flex flex-wrap gap-1.5 border-b border-sam-border pb-2"
      data-owner-finance-nav="1"
      aria-label={ko ? "매장 재무 메뉴" : "Owner finance navigation"}
    >
      {OWNER_FINANCE_NAV.map((item) => {
        const href = ownerFinanceSectionHref(storeId, item.section);
        const isActive = active === item.section;
        return (
          <Link
            key={item.key}
            href={href}
            className={`rounded-ui-rect px-2.5 py-1.5 text-xs font-medium ${
              isActive
                ? "bg-signature/10 text-signature"
                : "border border-sam-border bg-sam-app text-sam-fg"
            }`}
            data-owner-finance-nav-item={item.key}
          >
            {ko ? item.labelKo : item.labelEn}
          </Link>
        );
      })}
    </nav>
  );
}
