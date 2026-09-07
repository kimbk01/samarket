"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ADMIN_FINANCE_NAV } from "@/lib/finance/routes";

export function FinanceAdminNav({ ko }: { ko: boolean }) {
  const pathname = usePathname() || "";
  const sp = useSearchParams();
  const wallet = (sp.get("wallet") || "").toUpperCase();

  return (
    <nav
      className="flex flex-wrap gap-1.5 border-b border-sam-border pb-2"
      data-finance-admin-nav="1"
      aria-label={ko ? "재무 메뉴" : "Finance navigation"}
    >
      {ADMIN_FINANCE_NAV.map((item) => {
        const href = item.href();
        const pathOnly = href.split("?")[0];
        let active = false;
        if (item.key === "point") {
          active = pathname.includes("/transactions") && wallet === "POINT";
        } else if (item.key === "coin") {
          active = pathname.includes("/transactions") && wallet === "COIN";
        } else if (item.key === "cash") {
          active = pathname.includes("/transactions") && wallet === "CASH";
        } else if (item.key === "transactions") {
          active =
            (pathname === "/admin/finance" || pathname === "/admin/finance/transactions") &&
            !wallet;
        } else if (item.key === "conversions") {
          active =
            pathname.startsWith("/admin/finance/conversions") ||
            (pathname.includes("/transactions") && (sp.get("type") || "").includes("CONVERT"));
        } else {
          active = pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
        }
        return (
          <Link
            key={item.key}
            href={href}
            className={`rounded-ui-rect px-2.5 py-1.5 sam-text-helper font-medium ${
              active
                ? "bg-signature/10 text-signature"
                : "border border-sam-border bg-sam-app text-sam-fg"
            }`}
            data-finance-nav={item.key}
          >
            {ko ? item.labelKo : item.labelEn}
          </Link>
        );
      })}
    </nav>
  );
}
