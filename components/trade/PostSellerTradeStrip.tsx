"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MYPAGE_HOME_TRADE_SALES_HREF } from "@/lib/mypage/mypage-home-hub-links";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * Listing card trade summary — count from parent `/api/my/sales` (single fetch).
 */
export function PostSellerTradeStrip({
  chatCount,
  variant = "default",
}: {
  chatCount: number;
  variant?: "default" | "compact";
}) {
  const { safeT } = useI18n();

  if (chatCount <= 0) return null;

  const pad = variant === "compact" ? "px-3 py-2" : "px-4 py-3";
  const label =
    chatCount === 1
      ? safeT("marketplace_seller_trade_summary_any", {
          fallbackKo: "진행 중 거래 있음",
          fallbackEn: "Active trade(s)",
        })
      : safeT("marketplace_seller_trade_summary", {
          fallbackKo: `진행 중 거래 ${chatCount}건`,
          fallbackEn: `${chatCount} active trade(s)`,
          vars: { count: chatCount },
        });

  return (
    <div className={`border-t border-sam-border bg-sam-surface-muted/60 ${pad}`}>
      <Link
        href={MYPAGE_HOME_TRADE_SALES_HREF}
        className="flex min-w-0 items-center justify-between gap-2 rounded-ui-rect px-2 py-1.5 sam-text-body-secondary font-medium text-signature active:bg-signature/5"
      >
        <span className="truncate">{label}</span>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}
