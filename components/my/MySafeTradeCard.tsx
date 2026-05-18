"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function MySafeTradeCard() {
  const { t } = useI18n();
  return (
    <Link
      href="/mypage/points"
      className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-4 shadow-sm"
    >
      <div>
        <p className="sam-text-body font-semibold text-sam-fg">{t("my_safe_trade_title")}</p>
        <p className="mt-0.5 sam-text-body-secondary text-sam-muted">{t("my_safe_trade_desc")}</p>
      </div>
      <span className="text-sam-meta">
        <ChevronIcon />
      </span>
    </Link>
  );
}

function ChevronIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
