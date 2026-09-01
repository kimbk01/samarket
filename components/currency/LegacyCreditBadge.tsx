"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** Business Credit (AST-002) — legacy authority; not Coin gold. */
export function LegacyCreditBadge({ className = "" }: { className?: string }) {
  const { safeT } = useI18n();
  const label = "Business Credit";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sam-muted ${className}`}
      data-currency-badge="legacy-credit"
    >
      {label}
    </span>
  );
}
